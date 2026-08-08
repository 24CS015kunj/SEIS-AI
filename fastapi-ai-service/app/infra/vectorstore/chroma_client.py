"""ChromaDB Client.

Sole adapter to ChromaDB — collection lifecycle, upsert, and
similarity search all pass through this module, keeping the vector
store swappable behind one interface (§5.5). Connection, client
initialization, and health check are prepared without repository
indexing logic in Week 2 (§16 future path to a managed store).

Isolation strategy (frozen — §5.5, §12, §17, ADR-004): **one ChromaDB
collection per repository**, named ``repo_{repository_id}``. This is
called out in the design doc as a security property, not merely a
performance one ("never let one repo's chunks leak into another's
answer" — §5.6) — collections are never shared across repositories,
and every public method on :class:`ChromaClient` takes ``repository_id``
as an explicit, required argument used to derive the target collection.
``ChunkMetadata`` (Task 7, frozen) does not carry a ``workspace_id``
field — only ``repository_id`` — so workspace-level isolation is
achieved transitively: each ``Repository`` belongs to exactly one
``workspace_id``, and each repository maps to exactly one collection.
There is deliberately no ``workspace_id`` metadata filter here; adding
one would require widening the frozen ``ChunkMetadata`` contract, which
is out of scope for Task 9.

Async/sync boundary: chromadb's stable, documented client API
(``chromadb.HttpClient``) is synchronous. Rather than depend on the
exact async method surface of ``chromadb.AsyncHttpClient`` in the
pinned ``chromadb==0.6.2`` release — unverifiable from this Windows
environment, since the package is intentionally not installed here
(see ``requirements-vectorstore.txt``) — every blocking SDK call is
dispatched through ``asyncio.to_thread`` so the FastAPI event loop is
never blocked, without betting on an API surface this environment
cannot check against the real wheel until Task 14's Docker
verification.

Chroma is intentionally NOT importable as a hard dependency of this
module: importing this file must succeed even when ``chromadb`` is not
installed (the native Windows dev venv), so only *invoking* an
operation against a real collection fails — loudly, as a
:class:`~app.domain.exceptions.VectorDBError` — rather than failing at
import time and breaking FastAPI boot everywhere this module is
transitively imported (``app.api.deps``).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, TypeVar

import httpx
import structlog
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import VectorDBError
from app.domain.models import Chunk, ChunkMetadata, Embedding, SearchResultItem

try:
    import chromadb  # type: ignore[import-not-found]

    _CHROMADB_AVAILABLE = True
except ModuleNotFoundError:
    chromadb = None
    _CHROMADB_AVAILABLE = False

logger = structlog.get_logger("seis.infra.vectorstore")

T = TypeVar("T")

# Connection-level failures only — never a reason to retry a malformed
# request or a genuine application error (§14 Error Handling Strategy
# distinguishes transient infra failures from invalid requests).
_RETRYABLE_EXCEPTIONS: tuple[type[BaseException], ...] = (
    httpx.ConnectError,
    httpx.TimeoutException,
    ConnectionError,
    TimeoutError,
)

# Cosine space is configured explicitly on every collection at
# creation time so query distances are consistently interpretable as
# `1 - distance` similarity scores in [0, 1] — matching
# `Settings.retriever_similarity_threshold`'s normalized-similarity
# semantics (§19.6) and `SearchResultItem.score`'s `ge=0.0, le=1.0`
# bound. Chroma's own default space ("l2") has no such bounded
# interpretation.
_COLLECTION_METADATA = {"hnsw:space": "cosine"}


class ChromaClient:
    """Application-facing adapter over the ChromaDB SDK (§5.5).

    One instance is constructed per process (see
    ``app.api.deps.get_chroma_client``, Task 9) and reused for the
    process lifetime — a new ``chromadb.HttpClient`` is never created
    per operation. Construction is lazy: the underlying SDK client is
    built on first use, not in ``__init__``, so a ChromaDB outage at
    process boot never prevents the process from starting (readiness,
    not liveness, is what should fail — §9).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Any = None
        self._log = logger.bind(component="chroma_client")

    # ------------------------------------------------------------------
    # Collection naming / isolation boundary
    # ------------------------------------------------------------------
    @staticmethod
    def _collection_name(repository_id: str) -> str:
        if not repository_id or not repository_id.strip():
            raise VectorDBError(
                "repository_id must be a non-empty string to derive a ChromaDB "
                "collection name — refusing to operate on an unscoped collection.",
                details={},
            )
        return f"repo_{repository_id}"

    @staticmethod
    def _build_where(metadata_filter: dict[str, str] | None) -> dict[str, Any] | None:
        if not metadata_filter:
            return None
        if len(metadata_filter) == 1:
            key, value = next(iter(metadata_filter.items()))
            return {key: value}
        # Chroma's `where` clause requires an explicit boolean operator
        # once more than one key is present (a flat multi-key dict is
        # not accepted across all chromadb versions).
        return {"$and": [{key: value} for key, value in metadata_filter.items()]}

    # ------------------------------------------------------------------
    # SDK client construction (lazy, invoked only from worker threads)
    # ------------------------------------------------------------------
    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not _CHROMADB_AVAILABLE:
            raise VectorDBError(
                "chromadb package is not installed in this environment. ChromaDB "
                "is intentionally excluded from the native Windows virtualenv "
                "(see requirements-vectorstore.txt) and is only available inside "
                "the Task 14 Linux/Docker runtime.",
                details={"host": self._settings.chroma_host, "port": self._settings.chroma_port},
            )
        try:
            self._client = chromadb.HttpClient(
                host=self._settings.chroma_host, port=self._settings.chroma_port
            )
        except Exception as exc:
            raise VectorDBError(
                "Failed to initialize ChromaDB HTTP client",
                details={"host": self._settings.chroma_host, "port": self._settings.chroma_port},
            ) from exc
        return self._client

    def _get_collection(self, client: Any, repository_id: str) -> Any:
        return client.get_or_create_collection(
            name=self._collection_name(repository_id), metadata=_COLLECTION_METADATA
        )

    # ------------------------------------------------------------------
    # Execution helper: off-thread dispatch + bounded retry + error
    # translation + structured logging (§14, §15).
    # ------------------------------------------------------------------
    async def _run_blocking(self, fn: Callable[[], T]) -> T:
        async for attempt in AsyncRetrying(
            retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=0.5, max=4),
            reraise=True,
        ):
            with attempt:
                return await asyncio.to_thread(fn)
        raise AssertionError("unreachable: AsyncRetrying always returns or raises")

    async def _execute(self, operation: str, repository_id: str | None, fn: Callable[[], T]) -> T:
        log = self._log.bind(operation=operation, repository_id=repository_id)
        start = time.perf_counter()
        try:
            result = await self._run_blocking(fn)
        except VectorDBError:
            raise
        except _RETRYABLE_EXCEPTIONS as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "vectorstore.operation_failed",
                error_category="transient",
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise VectorDBError(
                f"ChromaDB {operation} failed: transient connectivity error",
                details={"operation": operation, "repository_id": repository_id},
            ) from exc
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "vectorstore.operation_failed",
                error_category="unknown",
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise VectorDBError(
                f"ChromaDB {operation} failed",
                details={"operation": operation, "repository_id": repository_id},
            ) from exc
        else:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.debug("vectorstore.operation_succeeded", duration_ms=duration_ms)
            return result

    # ------------------------------------------------------------------
    # Metadata <-> ChunkMetadata mapping
    # ------------------------------------------------------------------
    @staticmethod
    def _metadata_to_chroma(
        metadata: ChunkMetadata, *, indexed_at: datetime, embedding_model_version: str
    ) -> dict[str, str | int]:
        payload: dict[str, str | int] = {
            "repository_id": metadata.repository_id,
            "file_path": metadata.file_path,
            "language": metadata.language,
            "commit_sha": metadata.commit_sha,
            "chunk_type": metadata.chunk_type.value,
            "document_type": metadata.document_type.value,
            "start_line": metadata.start_line,
            "end_line": metadata.end_line,
            "embedding_model_version": embedding_model_version,
            "indexed_at": indexed_at.isoformat(),
        }
        if metadata.symbol_name is not None:
            payload["symbol_name"] = metadata.symbol_name
        return payload

    @staticmethod
    def _metadata_from_chroma(raw: dict[str, Any]) -> ChunkMetadata:
        indexed_at_raw = raw.get("indexed_at")
        return ChunkMetadata(
            repository_id=str(raw["repository_id"]),
            file_path=str(raw["file_path"]),
            language=str(raw["language"]),
            commit_sha=str(raw["commit_sha"]),
            chunk_type=ChunkType(raw["chunk_type"]),
            document_type=DocumentType(raw["document_type"]),
            symbol_name=raw.get("symbol_name"),
            start_line=int(raw["start_line"]),
            end_line=int(raw["end_line"]),
            embedding_model_version=raw.get("embedding_model_version"),
            indexed_at=datetime.fromisoformat(indexed_at_raw) if indexed_at_raw else None,
        )

    def _to_search_results(self, result: dict[str, Any]) -> list[SearchResultItem]:
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        items: list[SearchResultItem] = []
        for chunk_id, content, raw_metadata, distance in zip(
            ids, documents, metadatas, distances, strict=True
        ):
            # Cosine distance -> similarity score, clamped defensively so a
            # value outside the expected [0, 1] range (e.g. from an
            # embedding model whose vectors aren't unit-normalized) can
            # never violate `SearchResultItem.score`'s `ge=0.0, le=1.0`.
            score = max(0.0, min(1.0, 1.0 - float(distance)))
            items.append(
                SearchResultItem(
                    chunk_id=chunk_id,
                    content=content or "",
                    score=score,
                    metadata=self._metadata_from_chroma(raw_metadata),
                )
            )
        return items

    def _to_chunks(self, result: dict[str, Any]) -> list[Chunk]:
        ids = result.get("ids") or []
        documents = result.get("documents") or []
        metadatas = result.get("metadatas") or []
        return [
            Chunk(chunk_id=chunk_id, content=doc or "", metadata=self._metadata_from_chroma(meta))
            for chunk_id, doc, meta in zip(ids, documents, metadatas, strict=True)
        ]

    # ------------------------------------------------------------------
    # Public adapter surface
    # ------------------------------------------------------------------
    async def health_check(self) -> bool:
        """Readiness probe (§9). Never raises — always returns a bool.

        A failing/unreachable ChromaDB must surface as
        ``/health/ready`` reporting ``not_ready``, never as a crashed
        process or an unhandled exception (§9 Readiness vs Liveness).
        """
        if not _CHROMADB_AVAILABLE:
            self._log.warning(
                "vectorstore.health_check_unavailable", reason="chromadb_not_installed"
            )
            return False

        def _ping() -> bool:
            client = self._get_client()
            client.heartbeat()
            return True

        try:
            return await asyncio.wait_for(asyncio.to_thread(_ping), timeout=5.0)
        except Exception as exc:
            self._log.warning("vectorstore.health_check_failed", error=str(exc))
            return False

    async def get_or_create_collection(self, repository_id: str) -> None:
        """Ensures the repository's dedicated collection exists (Phase-02 §Task 9.2)."""

        def _op() -> None:
            client = self._get_client()
            self._get_collection(client, repository_id)

        await self._execute("get_or_create_collection", repository_id, _op)

    async def upsert_chunks(
        self, repository_id: str, chunks: list[Chunk], embeddings: list[Embedding]
    ) -> None:
        """Adds new chunks / updates existing ones in one call (§23.2 write path).

        Chroma's ``upsert`` is insert-if-absent, update-if-present —
        this single operation satisfies both "adding" and "updating"
        chunks; there is no separate add-only method because the
        design doc's write-path sequence diagram (§23.2) only ever
        calls ``upsert``.
        """
        if not chunks:
            return

        embedding_by_id = {embedding.chunk_id: embedding for embedding in embeddings}
        missing = [chunk.chunk_id for chunk in chunks if chunk.chunk_id not in embedding_by_id]
        if missing:
            raise VectorDBError(
                f"Missing embeddings for {len(missing)} chunk(s)",
                details={"repository_id": repository_id, "missing_chunk_ids": missing[:10]},
            )

        indexed_at = datetime.now(UTC)
        ids = [chunk.chunk_id for chunk in chunks]
        documents = [chunk.content for chunk in chunks]
        vectors = [embedding_by_id[chunk.chunk_id].vector for chunk in chunks]
        metadatas = [
            self._metadata_to_chroma(
                chunk.metadata,
                indexed_at=indexed_at,
                embedding_model_version=embedding_by_id[chunk.chunk_id].model_version,
            )
            for chunk in chunks
        ]

        def _op() -> None:
            client = self._get_client()
            collection = self._get_collection(client, repository_id)
            collection.upsert(ids=ids, embeddings=vectors, documents=documents, metadatas=metadatas)

        await self._execute("upsert_chunks", repository_id, _op)

    async def query_similarity(
        self,
        repository_id: str,
        query_vector: list[float],
        top_k: int,
        metadata_filter: dict[str, str] | None = None,
    ) -> list[SearchResultItem]:
        """Top-K similarity search scoped to one repository's collection (§5.6)."""
        where = self._build_where(metadata_filter)

        def _op() -> list[SearchResultItem]:
            client = self._get_client()
            collection = self._get_collection(client, repository_id)
            result = collection.query(query_embeddings=[query_vector], n_results=top_k, where=where)
            return self._to_search_results(result)

        return await self._execute("query_similarity", repository_id, _op)

    async def get_chunks(self, repository_id: str, chunk_ids: list[str]) -> list[Chunk]:
        """Direct retrieval of specific chunks by id (not a similarity query)."""
        if not chunk_ids:
            return []

        def _op() -> list[Chunk]:
            client = self._get_client()
            collection = self._get_collection(client, repository_id)
            result = collection.get(ids=chunk_ids, include=["documents", "metadatas"])
            return self._to_chunks(result)

        return await self._execute("get_chunks", repository_id, _op)

    async def delete_chunks(self, repository_id: str, chunk_ids: list[str]) -> None:
        """Deletes specific chunks — e.g. stale-chunk pruning after a reindex (§5.5, §16)."""
        if not chunk_ids:
            return

        def _op() -> None:
            client = self._get_client()
            collection = self._get_collection(client, repository_id)
            collection.delete(ids=chunk_ids)

        await self._execute("delete_chunks", repository_id, _op)

    async def delete_chunks_by_metadata(
        self, repository_id: str, metadata_filter: dict[str, str]
    ) -> None:
        """Deletes every chunk matching a metadata filter (e.g. every
        chunk for one ``file_path``) without needing their ids in
        advance.

        Added for Task 18 (Incremental Repository Synchronizer): a
        modified/deleted file's *old* chunk ids aren't known ahead of
        time (they're derived in part from ``commit_sha``, which
        changes on every push), so ``delete_chunks``' explicit-id-list
        signature can't express "delete this file's chunks." Chroma's
        native ``collection.delete(where=...)`` already supports
        filter-based deletion directly -- this method is a thin,
        one-call wrapper using the same ``_build_where`` helper
        ``query_similarity`` already relies on, not a new capability
        invented outside what the SDK provides.
        """

        def _op() -> None:
            client = self._get_client()
            collection = self._get_collection(client, repository_id)
            collection.delete(where=self._build_where(metadata_filter))

        await self._execute("delete_chunks_by_metadata", repository_id, _op)

    async def delete_collection(self, repository_id: str) -> None:
        """Drops a repository's entire collection (full reindex / repo delete, §22)."""

        def _op() -> None:
            client = self._get_client()
            client.delete_collection(name=self._collection_name(repository_id))

        await self._execute("delete_collection", repository_id, _op)

    async def close(self) -> None:
        """Releases the underlying SDK client, if one was ever constructed.

        No startup/shutdown hook forces this on process exit: the SDK
        client is built lazily and holds no long-lived resource that
        must be explicitly released between requests (a fresh
        `chromadb.HttpClient` does not hold an open connection the way
        a database connection pool would). Provided for explicit
        lifecycle management in tests and for a graceful, deliberate
        shutdown path if a future task adds one.
        """
        if self._client is not None:
            close_fn = getattr(self._client, "close", None)
            if callable(close_fn):
                await asyncio.to_thread(close_fn)
            self._client = None
        self._log.debug("vectorstore.client_closed")
