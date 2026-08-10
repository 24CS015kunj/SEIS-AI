"""Retriever.

Embeds the incoming query and executes repository-scoped similarity
search against ChromaDB. The hot path for both chat and search
(§5.6).

Task 19 (first task of Phase 4): ``VectorRetriever.retrieve`` embeds a
query via the configured embedding provider (originally Gemini
Embeddings; NVIDIA Nemotron-3-Embed-1B as of the ADR-007 migration --
see ``app.core.embedding.embedder``), searches the target repository's
ChromaDB collection, and filters out anything below the configured
similarity threshold. This module has no provider-specific knowledge
either way -- it only calls ``embedder.embed_query``.

Naming note: the task spec's own signature returns
``list[RetrievedChunk]``, but no such domain model exists -- Task 7's
frozen :class:`~app.domain.models.SearchResultItem` (``chunk_id``,
``content``, ``score``, ``metadata``) already has exactly that shape,
and is already what :meth:`ChromaClient.query_similarity` returns. This
is the same class of filename/name reconciliation already applied
throughout Phases 2-3 (e.g. ``redis_client`` -> ``cache_client``): used
as-is rather than defining a duplicate model for an identical shape.
"""

from __future__ import annotations

import structlog

from app.core.embedding.embedder import NemotronEmbedder
from app.domain.models import SearchResultItem
from app.infra.vectorstore.chroma_client import ChromaClient

logger = structlog.get_logger("seis.core.retrieval")


class VectorRetriever:
    """Repository-scoped vector similarity search (Task 19, §5.6)."""

    def __init__(self, chroma_client: ChromaClient, embedder: NemotronEmbedder) -> None:
        self._chroma = chroma_client
        self._embedder = embedder
        self._log = logger.bind(component="vector_retriever")

    async def retrieve(
        self,
        query: str,
        repository_id: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
    ) -> list[SearchResultItem]:
        """Returns up to ``top_k`` chunks for ``query``, most similar
        first, excluding anything scoring below ``score_threshold``
        (§Common Mistakes: never hand the LLM low-similarity noise).

        Repository isolation is inherited from
        :meth:`ChromaClient.query_similarity`'s own collection-per-
        repository design (§12, §17, ADR-004) -- every result is
        already confined to ``repository_id``'s own collection before
        the score filter ever runs.
        """
        query_vector = await self._embedder.embed_query(query)
        results = await self._chroma.query_similarity(repository_id, query_vector, top_k=top_k)

        filtered = [result for result in results if result.score >= score_threshold]
        # Best Practice: descending similarity order. ChromaDB already
        # returns nearest-first, but this is asserted explicitly rather
        # than relied upon implicitly.
        filtered.sort(key=lambda result: result.score, reverse=True)

        self._log.info(
            "chunks_retrieved",
            repository_id=repository_id,
            top_k=top_k,
            score_threshold=score_threshold,
            candidates=len(results),
            returned=len(filtered),
        )
        return filtered
