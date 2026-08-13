"""Evolution Report Compiler & Vector Indexer.

Task 29 (Phase 5, final task): compiles Tasks 26-28's ranked hotspots,
structural trends, and engineering insights into a formatted markdown
report, then chunks, embeds, and upserts it into the repository's own
ChromaDB collection -- otherwise this analysis exists only for the
duration of one request and is lost, never answerable in chat (§7.5
Problem Statement: "evolution metrics are lost if stored only in
transient reports rather than made searchable via chat"; Common
Mistakes: "failing to index evolution reports, making history
inaccessible to chat").

Embedder reconciliation: subtask 4 names ``GeminiEmbedder`` -- the same
pre-ADR-007 name every other Phase 3/4 module's spec text used before
the 2026-08-10 embedding-provider migration. Uses ``NemotronEmbedder``
(``app.core.embedding.embedder``) instead, identically to how Tasks 19
and 18 were already updated -- the public ``embed_chunks`` interface
this module depends on is unchanged by that migration.

``analysis_data: dict`` reconciliation: the frozen signature
(``compile_and_index_report(repository_id: str, analysis_data: dict) ->
EvolutionReport``) takes a loosely-typed ``dict`` rather than named
parameters for Tasks 26-28's three outputs. Three keys are read
(``"hotspots"``: ``list[HotspotMetrics]``, ``"trends"``:
``StructuralTrends``, ``"insights"``: ``list[EngineeringInsight]``) --
exactly the three inputs subtask 3's three named sections need, no
more. A missing key or wrong-shaped value raises a
:class:`~app.domain.exceptions.DomainValidationError` immediately
rather than compiling a silently-empty or partially-wrong report.

Chunking (Best Practices: "use distinct chunk type metadata
(chunk_type='evolution_section') for filtered search capability"):
one chunk per rendered ``## <Section>`` block -- exactly the three
subtask 3 names (Hotspots, Structural Trends, Recommendations) -- not
the general-purpose ``ASTChunker`` (Task 14), which this task's own
``Dependencies`` list doesn't even name. A section with no underlying
data still produces a chunk with an explicit "nothing to report" line,
so a query never silently gets zero results because a section was
omitted outright.

Synthetic metadata: an evolution report isn't a file that ever existed
in the repository's tree, so ``ChunkMetadata.file_path`` uses a fixed
virtual namespace (``evolution/<section>.md``) and ``.commit_sha`` uses
this specific report generation's timestamp (there is no single "this
report is as of commit X" answer -- Tasks 25-28's inputs may already
span many commits) rather than leaving either field with a fabricated,
misleading value.

Upsert semantics: each section's chunk id is deterministic
(``evolution-report-<section>``), not a fresh UUID per call -- running
this again for the same repository overwrites the same three chunks
rather than accumulating an ever-growing history of stale reports
(ChromaDB's ``upsert`` is insert-if-absent, update-if-present, Task 9).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import structlog

from app.core.embedding.embedder import EMBEDDING_MODEL_NAME, NemotronEmbedder
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import DomainValidationError
from app.domain.models import (
    Chunk,
    ChunkMetadata,
    Embedding,
    EngineeringInsight,
    EvolutionReport,
    HotspotMetrics,
    StructuralTrends,
)
from app.infra.vectorstore.chroma_client import ChromaClient

logger = structlog.get_logger("seis.core.evolution")

_KEY_HOTSPOTS = "hotspots"
_KEY_TRENDS = "trends"
_KEY_INSIGHTS = "insights"

_VIRTUAL_LANGUAGE = "markdown"
_VIRTUAL_PATH_PREFIX = "evolution"


def _require(analysis_data: dict[str, object], key: str, expected_type: type) -> object:
    """Fetches and shallow-validates one key from ``analysis_data``.

    Only checks the outer container type (``list`` vs. a specific
    model) -- Python's runtime ``isinstance`` cannot verify a list's
    element type, so a ``list`` containing the wrong element type still
    passes here and fails later, inside Pydantic construction, when
    that malformed content is actually used. This is the same boundary
    this loosely-typed ``dict`` signature inherently accepts.
    """
    if key not in analysis_data:
        raise DomainValidationError(
            f"analysis_data is missing required key '{key}'", details={"key": key}
        )
    value = analysis_data[key]
    if not isinstance(value, expected_type):
        raise DomainValidationError(
            f"analysis_data['{key}'] must be a {expected_type.__name__}",
            details={"key": key, "actual_type": type(value).__name__},
        )
    return value


def _format_hotspots_section(hotspots: list[HotspotMetrics]) -> str:
    if not hotspots:
        return "## Hotspots\n\nNo significant churn hotspots were detected in this analysis."
    lines = [
        f"- `{hotspot.file_path}` -- score {hotspot.hotspot_score:.0f}/100, "
        f"{hotspot.commit_count} commit(s), {hotspot.line_count} line(s)"
        for hotspot in hotspots
    ]
    return "## Hotspots\n\n" + "\n".join(lines)


def _format_trends_section(trends: StructuralTrends) -> str:
    if not trends.module_trends:
        return "## Structural Trends\n\nNo structural trend data was available for this analysis."
    lines = []
    for trend in trends.module_trends:
        flag = " (HIGH CHURN)" if trend.is_high_churn else ""
        lines.append(
            f"- `{trend.module}` -- {trend.churn_share:.0%} of analyzed churn{flag}, "
            f"{trend.commit_count} commit(s) across {trend.file_count} file(s)"
        )
    return "## Structural Trends\n\n" + "\n".join(lines)


def _format_recommendations_section(insights: list[EngineeringInsight]) -> str:
    if not insights:
        return (
            "## Recommendations\n\n"
            "No actionable recommendations were generated for this analysis."
        )
    lines = [
        f"- **[{insight.severity.value.upper()}] {insight.category.value}** -- "
        f"`{insight.subject}`: {insight.summary} _Recommendation: {insight.recommendation}_"
        for insight in insights
    ]
    return "## Recommendations\n\n" + "\n".join(lines)


class EvolutionIndexer:
    """Compiles and indexes a Software Evolution report (Task 29, §7.5)."""

    def __init__(self, chroma_client: ChromaClient, embedder: NemotronEmbedder) -> None:
        self._chroma_client = chroma_client
        self._embedder = embedder
        self._log = logger.bind(component="evolution_indexer")

    async def compile_and_index_report(
        self,
        repository_id: str,
        analysis_data: dict[str, object],
    ) -> EvolutionReport:
        hotspots = cast("list[HotspotMetrics]", _require(analysis_data, _KEY_HOTSPOTS, list))
        trends = cast(StructuralTrends, _require(analysis_data, _KEY_TRENDS, StructuralTrends))
        insights = cast("list[EngineeringInsight]", _require(analysis_data, _KEY_INSIGHTS, list))

        generated_at = datetime.now(UTC)
        sections = {
            "hotspots": _format_hotspots_section(hotspots),
            "structural-trends": _format_trends_section(trends),
            "recommendations": _format_recommendations_section(insights),
        }
        title = f"# Evolution Report: {repository_id}\n\nGenerated: {generated_at.isoformat()}"
        markdown = "\n\n".join([title, *sections.values()])

        commit_sha = f"evolution-report-{generated_at.strftime('%Y%m%dT%H%M%SZ')}"
        chunks = [
            Chunk(
                chunk_id=f"evolution-report-{slug}",
                content=text,
                metadata=ChunkMetadata(
                    repository_id=repository_id,
                    file_path=f"{_VIRTUAL_PATH_PREFIX}/{slug}.md",
                    language=_VIRTUAL_LANGUAGE,
                    commit_sha=commit_sha,
                    chunk_type=ChunkType.EVOLUTION_SECTION,
                    document_type=DocumentType.EVOLUTION_REPORT,
                    start_line=1,
                    end_line=max(1, len(text.splitlines())),
                ),
            )
            for slug, text in sections.items()
        ]

        vectors = await self._embedder.embed_chunks(chunks)
        embeddings = [
            Embedding(chunk_id=chunk.chunk_id, vector=vector, model_version=EMBEDDING_MODEL_NAME)
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]

        await self._chroma_client.get_or_create_collection(repository_id)
        await self._chroma_client.upsert_chunks(repository_id, chunks, embeddings)

        self._log.info(
            "evolution_report_indexed",
            repository_id=repository_id,
            chunk_count=len(chunks),
            hotspot_count=len(hotspots),
            insight_count=len(insights),
        )
        return EvolutionReport(
            repository_id=repository_id,
            markdown=markdown,
            generated_at=generated_at,
            indexed_chunk_count=len(chunks),
        )
