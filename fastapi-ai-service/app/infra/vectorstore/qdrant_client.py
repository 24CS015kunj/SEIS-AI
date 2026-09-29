"""Qdrant adapter preserving repository collections and domain chunk IDs.

UUIDv5 point IDs include repository + chunk ID; payload retains the original
chunk ID for citations and direct retrieval. Writes wait for acknowledgement.
Cloud HTTPS uses certificate verification and the async REST SDK, without
inference/model downloads, anonymous fallback, or a local vector service.
"""

from __future__ import annotations

import asyncio
import math
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, TypeVar
from uuid import NAMESPACE_URL, uuid5

import httpx
import structlog
from qdrant_client import AsyncQdrantClient, models
from qdrant_client.http.exceptions import ResponseHandlingException, UnexpectedResponse
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import VectorDBError
from app.domain.models import Chunk, ChunkMetadata, Embedding, SearchResultItem

T = TypeVar("T")
_KEYWORD_FIELDS = frozenset(
    {
        "repository_id",
        "file_path",
        "language",
        "commit_sha",
        "chunk_type",
        "document_type",
        "symbol_name",
        "embedding_model_version",
    }
)


def _transient(exc: BaseException) -> bool:
    if isinstance(exc, UnexpectedResponse):
        return exc.status_code is not None and (exc.status_code == 429 or exc.status_code >= 500)
    if isinstance(exc, ResponseHandlingException):
        return isinstance(exc.source, httpx.TransportError | ConnectionError | TimeoutError)
    return isinstance(exc, httpx.TransportError | ConnectionError | TimeoutError)


class QdrantVectorClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: AsyncQdrantClient | None = None
        self._created_loop: asyncio.AbstractEventLoop | None = None
        self._prepared: set[str] = set()
        self._collection_lock = asyncio.Lock()
        self._log = structlog.get_logger("seis.infra.vectorstore").bind(component="qdrant_client")

    @staticmethod
    def _collection_name(repository_id: str) -> str:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", repository_id):
            raise VectorDBError("repository_id must be a non-empty safe collection identifier")
        return f"repo_{repository_id}"

    @staticmethod
    def _point_id(repository_id: str, chunk_id: str) -> str:
        # Length-delimited components cannot collide on a separator in chunk IDs.
        return str(uuid5(NAMESPACE_URL, f"seis:{len(repository_id)}:{repository_id}:{chunk_id}"))

    def _get_client(self) -> AsyncQdrantClient:
        loop = asyncio.get_running_loop()
        if self._client is not None and self._created_loop is not loop:
            raise VectorDBError(
                "Qdrant client must be closed in its owning event loop before reuse"
            )
        if self._client is None:
            if (
                not self._settings.qdrant_url
                or not self._settings.qdrant_api_key.get_secret_value()
            ):
                raise VectorDBError("Configure QDRANT_URL and QDRANT_API_KEY before using Qdrant")
            self._client = AsyncQdrantClient(
                url=self._settings.qdrant_url,
                port=None,
                api_key=self._settings.qdrant_api_key.get_secret_value(),
                timeout=self._settings.qdrant_timeout_seconds,
                prefer_grpc=False,
                check_compatibility=False,
                limits=httpx.Limits(max_connections=16, max_keepalive_connections=8),
            )
            self._created_loop = loop
        return self._client

    async def _execute(self, operation: str, fn: Callable[[], Awaitable[T]]) -> T:
        try:
            async for attempt in AsyncRetrying(
                retry=retry_if_exception(_transient),
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=0.5, max=2),
                reraise=True,
            ):
                with attempt:
                    return await fn()
        except VectorDBError:
            raise
        except Exception as exc:
            self._log.warning(
                "vectorstore.operation_failed", operation=operation, error_type=type(exc).__name__
            )
            raise VectorDBError(
                f"Qdrant {operation} failed", details={"operation": operation}
            ) from exc
        raise AssertionError("unreachable")

    def _validate_vector(self, vector: list[float]) -> None:
        if (
            len(vector) != self._settings.embedding_dimension
            or not all(math.isfinite(value) for value in vector)
            or not any(vector)
        ):
            raise VectorDBError("Vector must be finite, nonzero and match EMBEDDING_DIMENSION")

    async def _ensure_collection(self, repository_id: str) -> str:
        name = self._collection_name(repository_id)
        if name in self._prepared:
            return name
        async with self._collection_lock:
            if name in self._prepared:
                return name
            client = self._get_client()
            if not await client.collection_exists(name):
                try:
                    await client.create_collection(
                        name,
                        vectors_config=models.VectorParams(
                            size=self._settings.embedding_dimension,
                            distance=models.Distance.COSINE,
                            on_disk=True,
                        ),
                        hnsw_config=models.HnswConfigDiff(on_disk=True),
                    )
                except UnexpectedResponse as exc:
                    # Another API process may have created the same collection.
                    if exc.status_code != 409:
                        raise
            info = await client.get_collection(name)
            vectors = info.config.params.vectors
            if not isinstance(vectors, models.VectorParams) or (
                vectors.size != self._settings.embedding_dimension
                or vectors.distance != models.Distance.COSINE
            ):
                raise VectorDBError(
                    "Existing Qdrant collection has incompatible vector configuration"
                )
            # Index before ingestion: Cloud strict mode rejects unindexed filters.
            for field in sorted(_KEYWORD_FIELDS):
                if field not in info.payload_schema:
                    await client.create_payload_index(
                        name,
                        field_name=field,
                        field_schema=models.PayloadSchemaType.KEYWORD,
                        wait=True,
                    )
            self._prepared.add(name)
        return name

    async def _existing_collection(self, repository_id: str) -> str | None:
        name = self._collection_name(repository_id)
        if name not in self._prepared and not await self._get_client().collection_exists(name):
            return None
        return await self._ensure_collection(repository_id)

    @staticmethod
    def _filter(metadata_filter: dict[str, str] | None) -> models.Filter | None:
        if not metadata_filter:
            return None
        if not set(metadata_filter).issubset(_KEYWORD_FIELDS):
            raise VectorDBError("Unsupported Qdrant metadata filter field")
        return models.Filter(
            must=[
                models.FieldCondition(key=field, match=models.MatchValue(value=value))
                for field, value in metadata_filter.items()
            ]
        )

    @staticmethod
    def _chunk(payload: dict[str, Any], repository_id: str) -> Chunk:
        metadata = ChunkMetadata.model_validate(payload)
        if metadata.repository_id != repository_id:
            raise VectorDBError("Vector payload does not match the requested repository")
        return Chunk(
            chunk_id=str(payload["chunk_id"]), content=str(payload["content"]), metadata=metadata
        )

    async def health_check(self) -> bool:
        try:
            await asyncio.wait_for(self._get_client().get_collections(), timeout=1.5)
            return True
        except Exception as exc:
            self._log.warning("vectorstore.health_check_failed", error_type=type(exc).__name__)
            return False

    async def get_or_create_collection(self, repository_id: str) -> None:
        async def op() -> None:
            await self._ensure_collection(repository_id)

        await self._execute("get_or_create_collection", op)

    async def upsert_chunks(
        self,
        repository_id: str,
        chunks: list[Chunk],
        embeddings: list[Embedding],
    ) -> None:
        self._collection_name(repository_id)
        if not chunks:
            return
        by_id = {embedding.chunk_id: embedding for embedding in embeddings}
        points: list[models.PointStruct] = []
        now = datetime.now(UTC).isoformat()
        for chunk in chunks:
            if chunk.metadata.repository_id != repository_id or chunk.chunk_id not in by_id:
                raise VectorDBError("Chunk repository mismatch or missing embedding")
            embedding = by_id[chunk.chunk_id]
            self._validate_vector(embedding.vector)
            payload = chunk.metadata.model_dump(mode="json", exclude_none=True)
            payload.update(
                chunk_id=chunk.chunk_id,
                content=chunk.content,
                indexed_at=now,
                embedding_model_version=embedding.model_version,
            )
            points.append(
                models.PointStruct(
                    id=self._point_id(repository_id, chunk.chunk_id),
                    vector=embedding.vector,
                    payload=payload,
                )
            )

        async def op() -> None:
            name = await self._ensure_collection(repository_id)
            batch_size = self._settings.qdrant_upsert_batch_size
            for offset in range(0, len(points), batch_size):
                await self._get_client().upsert(
                    name, points[offset : offset + batch_size], wait=True
                )

        await self._execute("upsert_chunks", op)

    async def query_similarity(
        self,
        repository_id: str,
        query_vector: list[float],
        top_k: int,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResultItem]:
        self._validate_vector(query_vector)
        if top_k <= 0:
            raise VectorDBError("top_k must be positive")
        query_filter = self._filter(metadata_filter)

        async def op() -> list[SearchResultItem]:
            name = await self._existing_collection(repository_id)
            if name is None:
                return []
            response = await self._get_client().query_points(
                name,
                query=query_vector,
                query_filter=query_filter,
                limit=top_k,
                with_payload=True,
                with_vectors=False,
            )
            result: list[SearchResultItem] = []
            for point in response.points:
                chunk = self._chunk(point.payload or {}, repository_id)
                result.append(
                    SearchResultItem(
                        chunk_id=chunk.chunk_id,
                        content=chunk.content,
                        metadata=chunk.metadata,
                        score=max(0.0, min(1.0, point.score)),
                    )
                )
            return result

        return await self._execute("query_similarity", op)

    async def get_all_chunks(self, repository_id: str, limit: int = 2000) -> list[Chunk]:
        if limit <= 0:
            return []

        async def op() -> list[Chunk]:
            name = await self._existing_collection(repository_id)
            if name is None:
                return []
            result: list[Chunk] = []
            offset: Any = None
            while len(result) < limit:
                points, offset = await self._get_client().scroll(
                    name,
                    limit=min(128, limit - len(result)),
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )
                result.extend(self._chunk(point.payload or {}, repository_id) for point in points)
                if offset is None:
                    break
            return result

        return await self._execute("get_all_chunks", op)

    async def get_chunks(self, repository_id: str, chunk_ids: list[str]) -> list[Chunk]:
        if not chunk_ids:
            return []

        async def op() -> list[Chunk]:
            name = await self._existing_collection(repository_id)
            if name is None:
                return []
            points = await self._get_client().retrieve(
                name,
                ids=[self._point_id(repository_id, chunk_id) for chunk_id in chunk_ids],
                with_payload=True,
                with_vectors=False,
            )
            return [self._chunk(point.payload or {}, repository_id) for point in points]

        return await self._execute("get_chunks", op)

    async def delete_chunks(self, repository_id: str, chunk_ids: list[str]) -> None:
        if not chunk_ids:
            return

        async def op() -> None:
            name = await self._existing_collection(repository_id)
            if name:
                await self._get_client().delete(
                    name,
                    models.PointIdsList(
                        points=[self._point_id(repository_id, chunk_id) for chunk_id in chunk_ids]
                    ),
                    wait=True,
                )

        await self._execute("delete_chunks", op)

    async def delete_chunks_by_metadata(
        self,
        repository_id: str,
        metadata_filter: dict[str, str],
    ) -> None:
        query_filter = self._filter(metadata_filter)
        if query_filter is None:
            raise VectorDBError("Refusing filter deletion without an explicit metadata filter")

        async def op() -> None:
            name = await self._existing_collection(repository_id)
            if name:
                await self._get_client().delete(
                    name, models.FilterSelector(filter=query_filter), wait=True
                )

        await self._execute("delete_chunks_by_metadata", op)

    async def delete_collection(self, repository_id: str) -> None:
        async def op() -> None:
            name = self._collection_name(repository_id)
            if await self._get_client().collection_exists(name):
                await self._get_client().delete_collection(name)
            self._prepared.discard(name)

        await self._execute("delete_collection", op)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
        self._created_loop = None
        self._prepared.clear()
