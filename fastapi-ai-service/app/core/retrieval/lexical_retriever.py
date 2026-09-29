"""Lexical Retriever (Task 63 -- exact repository/code identifier lookup).

Adds a second, non-semantic retrieval signal alongside
:class:`~app.core.retrieval.retriever.VectorRetriever` (never instead of
it -- see ``RepositoryChatService.chat``, which merges both before the
existing Nemotron reranker). Vector similarity over embeddings is good
at "what is this about" questions but structurally weak at exact-name
lookup: a query containing ``maze.py``, ``solveMaze``, or ``backend``
embeds as a point in semantic space that may sit nearer to prose
*describing* those things than to the actual file/symbol -- and can
miss it entirely once ``RETRIEVER_SIMILARITY_THRESHOLD`` is applied.

Design: no new infrastructure (per Task 63's own stop condition). Every
chunk already carries ``file_path``, ``symbol_name`` (when the chunker's
AST pass found one), and its raw ``content`` in ChromaDB metadata/
documents (see ``app.infra.vectorstore.chroma_client``) -- this module
pulls the target repository's full, already-indexed chunk set via the
new :meth:`VectorStoreClient.get_all_chunks` (one bounded, read-only scan;
no upsert, no new collection, no new DB) and matches a small set of
identifier-shaped terms extracted from the query against that metadata
in plain Python. At this project's real scale (tens of chunks per
repository -- 49 for the verified Mazesolver repository) this is
comfortably cheap; ``get_all_chunks``'s own ``limit`` bounds the
worst case.

Repository isolation: inherited entirely from ``VectorStoreClient``'s
existing collection-per-repository boundary (``repo_{repository_id}``,
ADR-004) -- this module never filters by ``workspace_id`` and never
sees another repository's collection, the same guarantee
``VectorRetriever`` already relies on.

Term extraction is deliberately generous, not precise: a bare lowercase
word like a stray directory name can produce false-positive candidates.
That is fine by design -- per Task 63's own architecture, "the reranker
remains the authoritative relevance-ranking stage." A lexical
false-positive only ever enters the merged candidate pool; it still has
to win against the real cross-encoder before it can reach the context
Nemotron 3 Ultra sees. Precision is the reranker's job; this module's
only job is recall for exact-name queries semantic search alone tends
to miss.

Scoring: coarse, deterministic tiers reflecting match confidence
(exact filename > exact symbol name > path segment (directory) > raw
content substring), used only to rank/bound candidates *before*
reranking -- ``RAGOptimizer.rerank_chunks`` always replaces these
scores with a real cross-encoder probability afterward, so they never
reach ``ChatResponse``.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

import structlog

from app.domain.models import Chunk, SearchResultItem
from app.infra.vectorstore.client import VectorStoreClient

logger = structlog.get_logger("seis.core.retrieval")

_DEFAULT_TOP_K = 10
_MAX_CHUNKS_SCANNED = 2000

# "maze.py", "app.js", "README.md" -- a short run of filename-safe
# characters, a dot, and a short extension.
_FILENAME_TOKEN = re.compile(r"\b[\w][\w\-]*\.[A-Za-z0-9]{1,10}\b")
# "solveMaze()" -> "solveMaze". Matched before the generic word scan so
# the call-site parentheses don't need to survive into a bare identifier.
_FUNCTION_CALL_TOKEN = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(\)")
# Same camelCase-boundary heuristic RAGOptimizer.expand_query already
# uses to *split* identifiers -- reused here only to *detect* one.
_CAMEL_CASE_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_WORD_TOKEN = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")

_SCORE_FILENAME_EXACT = 0.97
_SCORE_SYMBOL_EXACT = 0.93
_SCORE_PATH_SEGMENT = 0.80
_SCORE_CONTENT_SUBSTRING = 0.65

_MIN_BARE_WORD_LENGTH = 3
_MIN_CONTENT_SUBSTRING_LENGTH = 4

# Common question words filtered out of the generic word scan so a
# question like "What files are in the backend directory?" contributes
# "backend", not eleven near-meaningless single-word lexical candidates.
# Deliberately does NOT include ordinary nouns that are also plausible
# directory/file names in a real repository (e.g. "backend", "frontend",
# "maze") -- only closed-class/question-scaffolding words.
_STOPWORDS = frozenset(
    {
        "a", "an", "and", "are", "about", "can", "class", "classes",
        "defined", "describe", "do", "does", "file", "files", "for",
        "function", "functions", "how", "implementation", "implemented",
        "in", "is", "it", "me", "of", "on", "or", "repository", "show",
        "tell", "that", "the", "this", "to", "what", "where", "which",
        "with", "work", "works", "you",
    }
)  # fmt: skip


def extract_lexical_terms(query: str) -> list[str]:
    """Pulls filename/identifier-shaped terms out of a natural-language
    question. Order-preserving, deduplicated; matching downstream is
    case-insensitive, so casing here reflects only how the term was
    typed, not how it will be compared.

    Returns an empty list for a purely descriptive/conceptual question
    (e.g. "What is this repository about?") -- callers must treat that
    as "no lexical signal," not an error.
    """
    terms: list[str] = []

    for match in _FILENAME_TOKEN.finditer(query):
        terms.append(match.group(0))

    for match in _FUNCTION_CALL_TOKEN.finditer(query):
        terms.append(match.group(1))

    for match in _WORD_TOKEN.finditer(query):
        word = match.group(0)
        if word.lower() in _STOPWORDS:
            continue
        looks_like_identifier = "_" in word or bool(_CAMEL_CASE_BOUNDARY.search(word))
        if looks_like_identifier or (len(word) >= _MIN_BARE_WORD_LENGTH and word.islower()):
            terms.append(word)

    return list(dict.fromkeys(terms))


def _match_score(term: str, chunk: Chunk) -> float:
    """Highest-confidence match tier ``term`` reaches against ``chunk``, or
    ``0.0`` for no match at all. All comparisons are case-insensitive.
    """
    lowered_term = term.lower()
    path = PurePosixPath(chunk.metadata.file_path)
    segments = {segment.lower() for segment in path.parts}

    best = 0.0
    if path.name.lower() == lowered_term:
        best = max(best, _SCORE_FILENAME_EXACT)
    symbol_name = chunk.metadata.symbol_name
    if symbol_name is not None and symbol_name.lower() == lowered_term:
        best = max(best, _SCORE_SYMBOL_EXACT)
    if lowered_term in segments:
        best = max(best, _SCORE_PATH_SEGMENT)
    if len(term) >= _MIN_CONTENT_SUBSTRING_LENGTH and lowered_term in chunk.content.lower():
        best = max(best, _SCORE_CONTENT_SUBSTRING)
    return best


class LexicalRetriever:
    """Exact filename/identifier/path-segment lookup over a repository's
    already-indexed chunks (Task 63)."""

    def __init__(self, chroma_client: VectorStoreClient) -> None:
        self._chroma = chroma_client
        self._log = logger.bind(component="lexical_retriever")

    async def retrieve(
        self, query: str, repository_id: str, top_k: int = _DEFAULT_TOP_K
    ) -> list[SearchResultItem]:
        """Returns up to ``top_k`` chunks whose filename, symbol name, path
        segment, or raw content matches an identifier-shaped term
        extracted from ``query`` -- most-confident match first. Returns
        an empty list, never an error, when the query has no
        identifier-shaped terms or the repository has no indexed chunks.

        Repository isolation is inherited from
        :meth:`VectorStoreClient.get_all_chunks`'s own collection-per-
        repository scoping -- identical guarantee to
        :meth:`VectorRetriever.retrieve`.
        """
        terms = extract_lexical_terms(query)
        if not terms:
            self._log.info("lexical_retriever.no_terms_extracted", repository_id=repository_id)
            return []

        chunks = await self._chroma.get_all_chunks(repository_id, limit=_MAX_CHUNKS_SCANNED)
        if not chunks:
            return []

        scored = [
            (score, chunk)
            for chunk in chunks
            for score in [max(_match_score(term, chunk) for term in terms)]
            if score > 0.0
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        top = scored[:top_k]

        self._log.info(
            "lexical_retriever.matched",
            repository_id=repository_id,
            term_count=len(terms),
            candidate_count=len(chunks),
            matched_count=len(scored),
            returned=len(top),
        )
        return [
            SearchResultItem(
                chunk_id=chunk.chunk_id, content=chunk.content, score=score, metadata=chunk.metadata
            )
            for score, chunk in top
        ]
