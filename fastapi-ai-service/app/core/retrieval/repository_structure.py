"""Deterministic Repository File/Directory Lookup (Task 67).

Answers the class of question ``detect_structure_intent`` (this
package's own ``structure_intent.py``) recognizes as a structural
lookup -- "what files are in X", "does Y exist", "where is Z" -- from
the repository's own already-indexed chunk metadata, never from a
relevance judgment.

Source-of-truth decision: this service reads
:meth:`ChromaClient.get_all_chunks` -- the exact same repository-scoped,
already-existing method :class:`~app.core.retrieval.lexical_retriever.
LexicalRetriever` already uses (Task 63) -- rather than Express's own
``File`` Mongoose model. Inspection confirmed FastAPI has **no MongoDB
connectivity at all** (no ``pymongo``/``motor`` dependency, no
``MONGODB_URL`` in ``Settings``): Express and its ``File`` model live in
a completely separate process/database this service has never talked
to, for any feature, at any point in this codebase's history (chat,
search, evolution analysis -- all of it is ChromaDB/Redis-only). Reaching
into Express's MongoDB from here would mean either a new cross-service
sync mechanism or a second, parallel source of truth for "what files
exist" -- exactly what Task 67's own stop conditions rule out.

ChromaDB's chunk metadata is not a compromise -- it is *already* this
service's own authoritative record of "what this chatbot actually knows
about this repository." Every existing grounded answer is scoped to
"the indexed repository content" (every system prompt, every citation,
every prior task's own framing says exactly this); a file that was
filtered out during ingestion (binary/vendored/oversized --
``DocumentProcessor``'s own documented filter stage) was never something
this chatbot could discuss anyway, so it being absent from a structural
listing is consistent with the rest of the system, not a gap introduced
by this task. See this module's own test suite and Task 67's final
report for the live-verified evidence that this is a real superset of
what Task 63 needed (``backend/maze.py`` is indexed and appears here).

Every result is scoped by ``repository_id`` through the same
collection-per-repository mechanism (``repo_{repository_id}``, ADR-004)
every other component in this codebase already relies on for isolation
-- this module never queries an unscoped table and takes no
``workspace_id`` shortcut.

Nothing here is fabricated: every :class:`StructureMatch` wraps a real,
already-indexed :class:`~app.domain.models.Chunk` -- its ``file_path``,
``language``, and line range all come directly from ChromaDB, and its
``chunk_id`` is real and citable through the existing, unmodified
``ContextBuilder``/``CitationEngine`` pipeline (see
``RepositoryChatService`` for how a :class:`StructureMatch` becomes a
``SearchResultItem`` and flows through that unchanged machinery).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from app.core.retrieval.structure_intent import StructureIntent, StructureIntentKind
from app.domain.models import Chunk
from app.infra.vectorstore.chroma_client import ChromaClient

logger = structlog.get_logger("seis.core.retrieval")

# Same safety cap ChromaClient.get_all_chunks already documents as its
# own default -- no new bound invented here.
_MAX_CHUNKS_SCANNED = 2000


@dataclass(frozen=True)
class StructureMatch:
    """One real, indexed file (or, for a directory listing, the
    directory's own real representative chunk) -- never synthesized."""

    file_path: str
    chunk: Chunk
    language: str | None = None
    is_directory: bool = False


@dataclass(frozen=True)
class StructureQueryResult:
    found: bool
    matches: list[StructureMatch] = field(default_factory=list)


class RepositoryStructureService:
    """Deterministic file/directory lookup over one repository's already-
    indexed chunk metadata (Task 67)."""

    def __init__(self, chroma_client: ChromaClient) -> None:
        self._chroma = chroma_client
        self._log = logger.bind(component="repository_structure_service")

    async def resolve(self, repository_id: str, intent: StructureIntent) -> StructureQueryResult:
        """Answers ``intent`` for ``repository_id`` -- the only I/O this
        service performs is the one repository-scoped ChromaDB read
        (:meth:`ChromaClient.get_all_chunks`); no embedding call, no
        reranking call, no LLM call.
        """
        chunks = await self._chroma.get_all_chunks(repository_id, limit=_MAX_CHUNKS_SCANNED)
        distinct = _distinct_files(chunks)

        if intent.kind == StructureIntentKind.LIST_DIRECTORIES:
            result = _list_directories(distinct)
        elif intent.kind == StructureIntentKind.LIST_DIRECTORY:
            result = _list_directory(distinct, intent.path, intent.language)
        elif intent.kind in (StructureIntentKind.FILE_EXISTS, StructureIntentKind.FILE_LOCATION):
            assert intent.path is not None
            result = _find_file(distinct, intent.path)
        elif intent.kind == StructureIntentKind.DIRECTORY_EXISTS:
            assert intent.path is not None
            result = _directory_exists(distinct, intent.path)
        elif intent.kind == StructureIntentKind.SYMBOL_IN_FILE:
            assert intent.path is not None and intent.symbol is not None
            result = _symbol_in_file(chunks, distinct, intent.path, intent.symbol)
        else:  # pragma: no cover -- exhaustive over StructureIntentKind
            raise AssertionError(f"unhandled StructureIntentKind: {intent.kind}")

        self._log.info(
            "repository_structure.resolved",
            repository_id=repository_id,
            intent_kind=intent.kind.value,
            indexed_file_count=len(distinct),
            found=result.found,
            match_count=len(result.matches),
        )
        return result


def _distinct_files(chunks: list[Chunk]) -> dict[str, Chunk]:
    """One representative chunk per distinct ``file_path`` -- a real file
    normally has several chunks; the one with the smallest ``start_line``
    is kept, deterministically (Task 67 §duplicate-metadata handling)."""
    best: dict[str, Chunk] = {}
    for chunk in chunks:
        path = chunk.metadata.file_path
        existing = best.get(path)
        if existing is None or chunk.metadata.start_line < existing.metadata.start_line:
            best[path] = chunk
    return best


def _list_directory(
    distinct: dict[str, Chunk], path: str | None, language: str | None
) -> StructureQueryResult:
    if path is None:
        selected = {p: c for p, c in distinct.items() if "/" not in p}
    else:
        prefix = f"{path.lower()}/"
        selected = {p: c for p, c in distinct.items() if p.lower().startswith(prefix)}
    if language is not None:
        selected = {
            p: c for p, c in selected.items() if c.metadata.language.lower() == language.lower()
        }
    matches = [
        StructureMatch(file_path=p, chunk=c, language=c.metadata.language)
        for p, c in sorted(selected.items())
    ]
    return StructureQueryResult(found=bool(matches), matches=matches)


def _list_directories(distinct: dict[str, Chunk]) -> StructureQueryResult:
    top_level: dict[str, Chunk] = {}
    for path, chunk in distinct.items():
        if "/" not in path:
            continue
        directory = path.split("/", 1)[0]
        if directory not in top_level:
            top_level[directory] = chunk
    matches = [
        StructureMatch(file_path=directory, chunk=chunk, is_directory=True)
        for directory, chunk in sorted(top_level.items())
    ]
    return StructureQueryResult(found=bool(matches), matches=matches)


def _find_file(distinct: dict[str, Chunk], target: str) -> StructureQueryResult:
    """Resolves ``target`` against real file paths -- an exact
    (case-insensitive) full-path match if ``target`` contains a ``/``,
    else a basename match against every indexed file (Task 67 §case
    behavior: comparison is case-insensitive, but every returned
    ``file_path`` is the real, actually-indexed casing -- nothing about
    the match is ever invented)."""
    lowered_target = target.lower()
    if "/" in target:
        matches = [
            StructureMatch(file_path=p, chunk=c, language=c.metadata.language)
            for p, c in distinct.items()
            if p.lower() == lowered_target
        ]
    else:
        matches = [
            StructureMatch(file_path=p, chunk=c, language=c.metadata.language)
            for p, c in distinct.items()
            if p.lower().rsplit("/", 1)[-1] == lowered_target
        ]
    matches.sort(key=lambda match: match.file_path)
    return StructureQueryResult(found=bool(matches), matches=matches)


def _directory_exists(distinct: dict[str, Chunk], path: str) -> StructureQueryResult:
    prefix = f"{path.lower()}/"
    matches = [
        StructureMatch(file_path=p, chunk=c, language=c.metadata.language)
        for p, c in sorted(distinct.items())
        if p.lower().startswith(prefix)
    ]
    return StructureQueryResult(found=bool(matches), matches=matches)


def _symbol_in_file(
    chunks: list[Chunk], distinct: dict[str, Chunk], target_path: str, symbol: str
) -> StructureQueryResult:
    file_result = _find_file(distinct, target_path)
    if not file_result.found:
        return StructureQueryResult(found=False, matches=[])

    resolved_paths = {match.file_path for match in file_result.matches}
    lowered_symbol = symbol.lower()
    matched = [
        StructureMatch(
            file_path=chunk.metadata.file_path, chunk=chunk, language=chunk.metadata.language
        )
        for chunk in chunks
        if chunk.metadata.file_path in resolved_paths
        and (
            (chunk.metadata.symbol_name or "").lower() == lowered_symbol
            or lowered_symbol in chunk.content.lower()
        )
    ]
    matched.sort(key=lambda match: (match.file_path, match.chunk.metadata.start_line))
    # One representative chunk is enough for a yes/no + citation -- this
    # is a presence check, not a request for every occurrence.
    return StructureQueryResult(found=bool(matched), matches=matched[:1])
