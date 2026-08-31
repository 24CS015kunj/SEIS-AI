"""Repository Ingestion Worker Service (Task 40).

Orchestrates ONE ingestion job dispatched by
:meth:`~app.services.repository_processing_service.RepositoryProcessingService.submit_ingestion_job`
(Task 30): reconstructs the :class:`~app.domain.models.RepositoryManifest`
Task 30 serialized via ``manifest.model_dump(mode="json")``, runs it
through the already-built Document Processing (Task 13) -> Chunking
(Task 14) -> Metadata (Task 17) -> Embedding (Task 15/16, cache-checked)
-> ChromaDB (Task 9) pipeline, and updates the SAME
:class:`~app.domain.models.ProcessingStatusRecord` Task 30 already
created in Redis under ``seis:repo-processing-status:{repository_id}``.

This module owns zero business logic of its own beyond orchestration
order and status-record bookkeeping -- every actual parsing/chunking/
embedding/vector-store operation is delegated to the existing Task
13-18 components, reused exactly as
:class:`~app.core.processing.synchronizer.IncrementalSynchronizer`
(Task 18) already reuses them for its own diff-scoped variant of the
same pipeline.
:func:`~app.core.processing.chunker.build_chunks_for_documents` and
:func:`~app.core.embedding.embedding_cache.embed_with_cache` are the
two small orchestration helpers factored out of ``IncrementalSynchronizer``
alongside this task so neither implementation duplicates the
chunk-then-finalize-metadata or hash-lookup-embed-cache sequences
(explicit Task 40 instruction: "Do not duplicate... embedding...
caching... chunking... metadata creation").

Status-key/TTL constants (``_STATUS_KEY_PREFIX``, ``_STATUS_TTL_SECONDS``)
are imported directly from ``app.services.repository_processing_service``
-- the same "reuse the private cross-module contract" precedent that
module's own test suite already established
(``tests/unit/test_repository_processing_service.py`` imports the same
names) -- rather than duplicating the key format here or modifying
Task 30 to export it. ``ProcessingStage``'s five sub-stage values
(``DOCUMENT_PROCESSING``, ``CHUNKING``, ``EMBEDDING``, ``INDEXING``,
plus ``CLONING_MANIFEST`` which this worker has no use for -- there is
no clone step, the manifest already carries inline content) were
defined by Task 7 for exactly this purpose and were unused until now;
reused here rather than inventing a parallel progress representation.

Celery-task-id ("job_id") is accepted for log correlation only.
``ProcessingStatusRecord`` (Task 7, frozen) has no ``job_id`` field --
``JobSubmissionResult``'s own docstring (Task 30) is explicit that
processing status is tracked independently of Celery's result backend,
so this worker does not invent one either.

Retry policy: none at this layer, deliberately. See
``app/tasks/ingestion.py``'s module docstring for why -- every
transient infrastructure failure this service can hit is already
retried, bounded, inside its own adapter before it ever reaches here.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import structlog
from pydantic import ValidationError

from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache, embed_with_cache
from app.core.processing.chunker import ASTChunker, build_chunks_for_documents
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.domain.enums import ProcessingStage, ProcessingStatus
from app.domain.models import ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.infra.vectorstore.chroma_client import ChromaClient
from app.services.repository_processing_service import _STATUS_KEY_PREFIX, _STATUS_TTL_SECONDS

logger = structlog.get_logger("seis.services.repository_ingestion_worker")


class RepositoryIngestionWorkerService:
    """Executes one repository ingestion job end-to-end (Task 40)."""

    def __init__(
        self,
        chroma_client: ChromaClient,
        document_processor: DocumentProcessor,
        chunker: ASTChunker,
        metadata_generator: MetadataGenerator,
        embedder: NemotronEmbedder,
        embedding_cache: EmbeddingCache,
        cache_client: RedisClient,
    ) -> None:
        self._chroma = chroma_client
        self._document_processor = document_processor
        self._chunker = chunker
        self._metadata_generator = metadata_generator
        self._embedder = embedder
        self._embedding_cache = embedding_cache
        self._cache_client = cache_client
        self._log = logger.bind(component="repository_ingestion_worker")

    async def process_ingestion_job(
        self, payload: Mapping[str, Any], *, job_id: str | None = None
    ) -> None:
        """Processes one Task 30-dispatched ingestion payload.

        Never swallows an exception: every failure path marks the
        repository's status record FAILED (when a ``repository_id`` is
        determinable) and then re-raises, so Celery's own task-failure
        bookkeeping/logging sees it too.

        Raises:
            pydantic.ValidationError | TypeError: ``payload`` cannot be
                reconstructed into a valid :class:`RepositoryManifest`.
            Exception: whatever the processing pipeline itself raised
                (``RepositoryError``/``EmbeddingError``/``VectorDBError``/...
                or any other failure) -- always re-raised after the
                status record is marked FAILED, never swallowed.
        """
        log = self._log.bind(job_id=job_id)
        raw_repository_id = payload.get("repository_id") if isinstance(payload, Mapping) else None

        try:
            manifest = RepositoryManifest(**payload)
        except (ValidationError, TypeError) as exc:
            log.error("ingestion_worker.invalid_manifest_payload", error=str(exc))
            if isinstance(raw_repository_id, str) and raw_repository_id.strip():
                await self._mark_failed(
                    raw_repository_id, error="Invalid repository manifest payload."
                )
            raise

        log = log.bind(repository_id=manifest.repository_id, commit_sha=manifest.commit_sha)
        try:
            await self._transition(
                manifest.repository_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.DOCUMENT_PROCESSING,
                commit_sha=manifest.commit_sha,
                file_count=len(manifest.files),
            )
            documents = self._document_processor.process_manifest(manifest)

            await self._transition(
                manifest.repository_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.CHUNKING,
            )
            chunks = build_chunks_for_documents(documents, self._chunker, self._metadata_generator)

            await self._transition(
                manifest.repository_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.EMBEDDING,
            )
            embeddings = await embed_with_cache(chunks, self._embedder, self._embedding_cache)

            await self._transition(
                manifest.repository_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.INDEXING,
            )
            await self._chroma.upsert_chunks(manifest.repository_id, chunks, embeddings)

            await self._transition(
                manifest.repository_id,
                status=ProcessingStatus.READY,
                stage=None,
                chunk_count=len(chunks),
            )
            log.info(
                "ingestion_worker.completed",
                document_count=len(documents),
                chunk_count=len(chunks),
            )
        except Exception as exc:
            log.error("ingestion_worker.processing_failed", error=str(exc))
            await self._mark_failed(manifest.repository_id, error=str(exc))
            raise

    async def _mark_failed(self, repository_id: str, *, error: str) -> None:
        await self._transition(
            repository_id, status=ProcessingStatus.FAILED, stage=None, error=error
        )

    async def _transition(
        self,
        repository_id: str,
        *,
        status: ProcessingStatus,
        stage: ProcessingStage | None,
        commit_sha: str | None = None,
        error: str | None = None,
        file_count: int | None = None,
        chunk_count: int | None = None,
    ) -> None:
        """Updates the SAME status record Task 30 created (never a new
        key), preserving whichever fields aren't part of this
        transition and refreshing the existing TTL policy on every
        write so a long-running job's record doesn't expire mid-run.
        """
        existing = await self._read_status(repository_id)
        now = datetime.now(UTC)
        record = ProcessingStatusRecord(
            repository_id=repository_id,
            status=status,
            stage=stage,
            commit_sha=commit_sha
            if commit_sha is not None
            else (existing.commit_sha if existing else ""),
            started_at=existing.started_at if existing else now,
            updated_at=now,
            error=error,
            file_count=file_count
            if file_count is not None
            else (existing.file_count if existing else None),
            chunk_count=chunk_count
            if chunk_count is not None
            else (existing.chunk_count if existing else None),
        )
        await self._cache_client.set_cache(
            f"{_STATUS_KEY_PREFIX}{repository_id}", record.model_dump_json(), _STATUS_TTL_SECONDS
        )

    async def _read_status(self, repository_id: str) -> ProcessingStatusRecord | None:
        raw = await self._cache_client.get_cache(f"{_STATUS_KEY_PREFIX}{repository_id}")
        if raw is None:
            return None
        return ProcessingStatusRecord.model_validate_json(raw)
