"""Unit tests for app/core/evolution/evolution_indexer.py (Task 29).

Uses real `ChromaClient`/`NemotronEmbedder` instances whose public
methods are monkeypatched -- the same pattern already used in
tests/unit/test_synchronizer.py, avoiding duck-typed fakes that would
fail the constructor's real type hints.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.domain.enums import ChunkType, DocumentType, InsightCategory, InsightSeverity
from app.domain.exceptions import DomainValidationError
from app.domain.models import (
    Chunk,
    Embedding,
    EngineeringInsight,
    HotspotMetrics,
    ModuleTrend,
    StructuralTrends,
)
from app.infra.vectorstore.chroma_client import ChromaClient


def _hotspot(file_path: str = "src/app.py", score: float = 80.0) -> HotspotMetrics:
    return HotspotMetrics(file_path=file_path, commit_count=5, line_count=100, hotspot_score=score)


def _trends(*module_trends: ModuleTrend) -> StructuralTrends:
    return StructuralTrends(
        module_trends=list(module_trends),
        high_churn_modules=[t.module for t in module_trends if t.is_high_churn],
    )


def _insight(subject: str = "src/app.py") -> EngineeringInsight:
    return EngineeringInsight(
        category=InsightCategory.HIGH_RISK_MODULE,
        severity=InsightSeverity.CRITICAL,
        subject=subject,
        summary="high churn",
        recommendation="add tests",
    )


def _analysis_data(
    hotspots: list[HotspotMetrics] | None = None,
    trends: StructuralTrends | None = None,
    insights: list[EngineeringInsight] | None = None,
) -> dict[str, object]:
    return {
        "hotspots": hotspots if hotspots is not None else [_hotspot()],
        "trends": trends if trends is not None else _trends(),
        "insights": insights if insights is not None else [_insight()],
    }


class Harness:
    def __init__(self) -> None:
        self.collection_calls: list[str] = []
        self.upsert_calls: list[tuple[str, list[Chunk], list[Embedding]]] = []
        self.embed_calls: list[list[Chunk]] = []
        self.call_order: list[str] = []

        self.chroma = ChromaClient(settings=Settings())
        self.embedder = NemotronEmbedder(settings=Settings())

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> EvolutionIndexer:
        async def _get_or_create_collection(repository_id: str) -> None:
            self.call_order.append("create_collection")
            self.collection_calls.append(repository_id)

        async def _upsert_chunks(
            repository_id: str, chunks: list[Chunk], embeddings: list[Embedding]
        ) -> None:
            self.call_order.append("upsert")
            self.upsert_calls.append((repository_id, chunks, embeddings))

        async def _embed_chunks(chunks: list[Chunk], batch_size: int = 32) -> list[list[float]]:
            self.call_order.append("embed")
            self.embed_calls.append(chunks)
            return [[0.1, 0.2, 0.3] for _ in chunks]

        monkeypatch.setattr(self.chroma, "get_or_create_collection", _get_or_create_collection)
        monkeypatch.setattr(self.chroma, "upsert_chunks", _upsert_chunks)
        monkeypatch.setattr(self.embedder, "embed_chunks", _embed_chunks)

        return EvolutionIndexer(chroma_client=self.chroma, embedder=self.embedder)


@pytest.fixture
def harness() -> Harness:
    return Harness()


async def test_missing_hotspots_key_raises_domainvalidationerror(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data()
    del data["hotspots"]

    with pytest.raises(DomainValidationError, match="hotspots"):
        await indexer.compile_and_index_report("repo-1", data)


async def test_missing_trends_key_raises_domainvalidationerror(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data()
    del data["trends"]

    with pytest.raises(DomainValidationError, match="trends"):
        await indexer.compile_and_index_report("repo-1", data)


async def test_missing_insights_key_raises_domainvalidationerror(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data()
    del data["insights"]

    with pytest.raises(DomainValidationError, match="insights"):
        await indexer.compile_and_index_report("repo-1", data)


async def test_wrong_type_for_hotspots_raises_domainvalidationerror(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data()
    data["hotspots"] = "not-a-list"

    with pytest.raises(DomainValidationError):
        await indexer.compile_and_index_report("repo-1", data)


async def test_wrong_type_for_trends_raises_domainvalidationerror(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data()
    data["trends"] = {"not": "a StructuralTrends"}

    with pytest.raises(DomainValidationError):
        await indexer.compile_and_index_report("repo-1", data)


async def test_markdown_contains_all_three_section_headers(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    report = await indexer.compile_and_index_report("repo-1", _analysis_data())

    assert "## Hotspots" in report.markdown
    assert "## Structural Trends" in report.markdown
    assert "## Recommendations" in report.markdown


async def test_empty_hotspots_produces_a_placeholder_line(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    report = await indexer.compile_and_index_report("repo-1", _analysis_data(hotspots=[]))

    assert "No significant churn hotspots" in report.markdown


async def test_empty_trends_produces_a_placeholder_line(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    report = await indexer.compile_and_index_report("repo-1", _analysis_data(trends=_trends()))

    assert "No structural trend data" in report.markdown


async def test_empty_insights_produces_a_placeholder_line(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    report = await indexer.compile_and_index_report("repo-1", _analysis_data(insights=[]))

    assert "No actionable recommendations" in report.markdown


async def test_hotspot_data_appears_in_the_hotspots_section(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data(hotspots=[_hotspot(file_path="src/auth.py", score=95.0)])

    report = await indexer.compile_and_index_report("repo-1", data)

    assert "src/auth.py" in report.markdown
    assert "95" in report.markdown


async def test_trend_data_appears_in_the_trends_section(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    module_trend = ModuleTrend(
        module="app/core", file_count=2, commit_count=8, churn_share=0.8, is_high_churn=True
    )
    data = _analysis_data(trends=_trends(module_trend))

    report = await indexer.compile_and_index_report("repo-1", data)

    assert "app/core" in report.markdown
    assert "HIGH CHURN" in report.markdown


async def test_insight_data_appears_in_the_recommendations_section(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)
    data = _analysis_data(insights=[_insight(subject="src/auth.py")])

    report = await indexer.compile_and_index_report("repo-1", data)

    assert "src/auth.py" in report.markdown
    assert "CRITICAL" in report.markdown


async def test_exactly_three_chunks_are_embedded(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    await indexer.compile_and_index_report("repo-1", _analysis_data())

    assert len(harness.embed_calls) == 1
    assert len(harness.embed_calls[0]) == 3


async def test_chunks_use_evolution_section_and_evolution_report_types(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    await indexer.compile_and_index_report("repo-1", _analysis_data())

    _, chunks, _ = harness.upsert_calls[0]
    for chunk in chunks:
        assert chunk.metadata.chunk_type == ChunkType.EVOLUTION_SECTION
        assert chunk.metadata.document_type == DocumentType.EVOLUTION_REPORT


async def test_collection_is_created_before_upsert(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    await indexer.compile_and_index_report("repo-1", _analysis_data())

    assert harness.call_order.index("create_collection") < harness.call_order.index("upsert")


async def test_upsert_is_scoped_to_the_given_repository_id(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    await indexer.compile_and_index_report("repo-42", _analysis_data())

    repository_id, _, _ = harness.upsert_calls[0]
    assert repository_id == "repo-42"
    assert harness.collection_calls == ["repo-42"]


async def test_returned_report_has_an_indexed_chunk_count_of_three(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    report = await indexer.compile_and_index_report("repo-1", _analysis_data())

    assert report.indexed_chunk_count == 3


async def test_chunk_ids_are_deterministic_across_calls(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    indexer = harness.wire(monkeypatch)

    await indexer.compile_and_index_report("repo-1", _analysis_data())
    _, first_chunks, _ = harness.upsert_calls[0]
    await indexer.compile_and_index_report("repo-1", _analysis_data())
    _, second_chunks, _ = harness.upsert_calls[1]

    assert {c.chunk_id for c in first_chunks} == {c.chunk_id for c in second_chunks}
