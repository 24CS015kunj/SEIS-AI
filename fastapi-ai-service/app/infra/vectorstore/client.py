"""Vector-store contract and explicit backend selection.

Historical chroma_client argument/provider names remain for caller compatibility.
Neither backend falls back to the other if a configured service fails.
"""

from typing import Protocol

from app.config.settings import Settings
from app.domain.models import Chunk, Embedding, SearchResultItem


class VectorStoreClient(Protocol):
    async def health_check(self) -> bool: ...
    async def get_or_create_collection(self, repository_id: str) -> None: ...
    async def upsert_chunks(
        self, repository_id: str, chunks: list[Chunk], embeddings: list[Embedding]
    ) -> None: ...
    async def query_similarity(
        self,
        repository_id: str,
        query_vector: list[float],
        top_k: int,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResultItem]: ...
    async def get_all_chunks(self, repository_id: str, limit: int = 2000) -> list[Chunk]: ...
    async def get_chunks(self, repository_id: str, chunk_ids: list[str]) -> list[Chunk]: ...
    async def delete_chunks(self, repository_id: str, chunk_ids: list[str]) -> None: ...
    async def delete_chunks_by_metadata(
        self, repository_id: str, metadata_filter: dict[str, str]
    ) -> None: ...
    async def delete_collection(self, repository_id: str) -> None: ...
    async def close(self) -> None: ...


def create_vector_store(settings: Settings) -> VectorStoreClient:
    if settings.vector_store_backend == "qdrant":
        from app.infra.vectorstore.qdrant_client import QdrantVectorClient

        return QdrantVectorClient(settings)
    from app.infra.vectorstore.chroma_client import ChromaClient

    return ChromaClient(settings)
