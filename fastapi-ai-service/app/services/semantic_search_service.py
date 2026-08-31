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
from app.core.retrieval.retriever import VectorRetriever
from app.domain.exceptions import DomainValidationError
from app.domain.models import SearchResponse

logger = structlog.get_logger("seis.services.semantic_search")


class SemanticSearchService:
    """Orchestrates direct semantic snippet search without LLM generation."""

    def __init__(self, retriever: VectorRetriever, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._retriever = retriever
        self._log = logger.bind(component="semantic_search_service")

    async def search(self, repository_id: str, query: str) -> SearchResponse:
        """Retrieves the most relevant chunks for ``query`` within
        ``repository_id``'s ChromaDB collection.

        ``top_k``/``score_threshold`` are always resolved from
        ``Settings`` (``retriever_default_top_k``,
        ``retriever_similarity_threshold``) rather than left to
        ``VectorRetriever.retrieve``'s own method-default parameter
        values, so the actually-applied threshold is the one operators
        configure, not an unrelated default baked into the retriever's
        signature.

        Raises:
            DomainValidationError: ``repository_id`` or ``query`` is
                blank/whitespace-only -- a shape Pydantic's own field
                constraints on the request body can catch for
                ``query``, but ``repository_id`` comes from the URL
                path (same gap ``ingest_routes.py`` guards against for
                its own path parameter).
        """
        if not repository_id.strip():
            raise DomainValidationError(
                "repository_id must not be blank.", details={"repository_id": repository_id}
            )
        if not query.strip():
            raise DomainValidationError("query must not be blank.", details={})

        results = await self._retriever.retrieve(
            query,
            repository_id,
            top_k=self.settings.retriever_default_top_k,
            score_threshold=self.settings.retriever_similarity_threshold,
        )

        self._log.info(
            "semantic_search.completed",
            repository_id=repository_id,
            result_count=len(results),
        )
        return SearchResponse(repository_id=repository_id, query=query, results=results)
