"""Semantic Search orchestration service.

Coordinates the Retriever for direct, generation-free repository
search (§5.12). Task 53: the smallest Search-first step -- no LLM
call, no prompt construction, no citation extraction. Those belong to
``RepositoryChatService`` (still a stub), a deliberately separate
orchestrator per both services' own module docstrings.

``RAGOptimizer`` (Task 24) is intentionally NOT wired in here. Its
reranking *replaces* each chunk's vector-similarity score with a
cross-encoder relevance probability (its own module docstring) and
requires a second live NVIDIA API call plus its own API key -- both a
retrieval-behavior change and a new hard dependency for a first
semantic-search endpoint. Task 53 explicitly limits integration to
cases that don't change existing retrieval behavior, so plain
``VectorRetriever`` results are returned as-is.
"""

from __future__ import annotations

import structlog

from app.config.settings import Settings, get_settings
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.rag_optimizer import RAGOptimizer
from app.core.retrieval.retriever import VectorRetriever
from app.domain.exceptions import DomainValidationError, VectorDBError
from app.domain.models import SearchResponse, SearchResultItem

logger = structlog.get_logger("seis.services.semantic_search")

_DEFAULT_LEXICAL_TOP_K = 10
_DEFAULT_MERGED_CANDIDATE_POOL = 30


class SemanticSearchService:
    """Orchestrates hybrid semantic and lexical snippet search without LLM generation."""

    def __init__(
        self,
        retriever: VectorRetriever,
        lexical_retriever: LexicalRetriever | None = None,
        rag_optimizer: RAGOptimizer | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._retriever = retriever
        self._lexical_retriever = lexical_retriever
        self._rag_optimizer = rag_optimizer
        self._log = logger.bind(component="semantic_search_service")

    async def search(self, repository_id: str, query: str) -> SearchResponse:
        """Retrieves the most relevant chunks for ``query`` within
        ``repository_id``'s ChromaDB collection using hybrid vector + lexical search.
        """
        if not repository_id.strip():
            raise DomainValidationError(
                "repository_id must not be blank.", details={"repository_id": repository_id}
            )
        if not query.strip():
            raise DomainValidationError("query must not be blank.", details={})

        semantic_results = await self._retriever.retrieve(
            query,
            repository_id,
            top_k=self.settings.retriever_default_top_k,
            score_threshold=self.settings.retriever_similarity_threshold,
        )

        lexical_results: list[SearchResultItem] = []
        if self._lexical_retriever is not None:
            try:
                lexical_results = await self._lexical_retriever.retrieve(
                    query, repository_id, top_k=_DEFAULT_LEXICAL_TOP_K
                )
            except VectorDBError as exc:
                self._log.warning(
                    "semantic_search.lexical_retrieval_failed",
                    repository_id=repository_id,
                    error=str(exc),
                )
                lexical_results = []

        candidates = _merge_search_candidates(
            semantic_results, lexical_results, max_total=_DEFAULT_MERGED_CANDIDATE_POOL
        )

        final_results = candidates
        if self._rag_optimizer is not None and candidates:
            try:
                final_results = await self._rag_optimizer.rerank_chunks(
                    query, candidates, top_k=self.settings.retriever_default_top_k
                )
            except Exception as exc:
                self._log.warning(
                    "semantic_search.rerank_failed",
                    repository_id=repository_id,
                    error=str(exc),
                )
                final_results = candidates[: self.settings.retriever_default_top_k]

        self._log.info(
            "semantic_search.completed",
            repository_id=repository_id,
            semantic_count=len(semantic_results),
            lexical_count=len(lexical_results),
            result_count=len(final_results),
        )
        return SearchResponse(repository_id=repository_id, query=query, results=final_results)


def _merge_search_candidates(
    semantic: list[SearchResultItem],
    lexical: list[SearchResultItem],
    max_total: int,
) -> list[SearchResultItem]:
    """Merges semantic and lexical candidates, deduplicating by chunk_id."""
    seen: set[str] = set()
    merged: list[SearchResultItem] = []

    for item in semantic:
        if item.chunk_id not in seen:
            seen.add(item.chunk_id)
            merged.append(item)

    for item in lexical:
        if len(merged) >= max_total:
            break
        if item.chunk_id not in seen:
            seen.add(item.chunk_id)
            merged.append(item)

    return merged
