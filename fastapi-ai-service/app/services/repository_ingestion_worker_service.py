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

import asyncio
import contextlib
import json
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import structlog
from pydantic import ValidationError

from app.config.settings import Settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache, embed_with_cache
from app.core.processing.chunker import ASTChunker, build_chunks_for_documents
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.domain.enums import ProcessingStage, ProcessingStatus
from app.domain.models import ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.infra.http.express_client import ExpressCallbackClient
from app.infra.vectorstore.client import VectorStoreClient
from app.services.repository_processing_service import _STATUS_KEY_PREFIX, _STATUS_TTL_SECONDS

logger = structlog.get_logger("seis.services.repository_ingestion_worker")


class AttemptSupersededError(Exception):
    """Raised when an ingestion attempt has been superseded or lost ownership in Redis."""

    def __init__(self, repository_id: str, job_id: str | None, reason: str) -> None:
        super().__init__(
            f"Attempt {job_id!r} for repository {repository_id!r} was superseded ({reason})"
        )
        self.repository_id = repository_id
        self.job_id = job_id
        self.reason = reason


class RepositoryIngestionWorkerService:
    """Executes one repository ingestion job end-to-end (Task 40)."""

    def __init__(
        self,
        chroma_client: VectorStoreClient,
        document_processor: DocumentProcessor,
        chunker: ASTChunker,
        metadata_generator: MetadataGenerator,
        embedder: NemotronEmbedder,
        embedding_cache: EmbeddingCache,
        cache_client: RedisClient,
        express_callback_client: ExpressCallbackClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._chroma = chroma_client
        self._document_processor = document_processor
        self._chunker = chunker
        self._metadata_generator = metadata_generator
        self._embedder = embedder
        self._embedding_cache = embedding_cache
        self._cache_client = cache_client
        self._express_callback_client = express_callback_client
        self._settings = settings
        self._log = logger.bind(component="repository_ingestion_worker")

    async def process_ingestion_job(
        self, payload: Mapping[str, Any], *, job_id: str | None = None
    ) -> None:
        """Processes one Task 30-dispatched ingestion payload.

        Never swallows an unexpected exception: every failure path marks the
        repository's status record FAILED (when a ``repository_id`` is
        determinable) and then re-raises. Handles ``asyncio.CancelledError``
        explicitly on service shutdown.
        """
        log = self._log.bind(job_id=job_id)
        raw_repository_id = payload.get("repository_id") if isinstance(payload, Mapping) else None

        try:
            manifest = RepositoryManifest(**payload)
        except (ValidationError, TypeError) as exc:
            log.error("ingestion_worker.invalid_manifest_payload", error=str(exc))
            if isinstance(raw_repository_id, str) and raw_repository_id.strip():
                await self._mark_failed(
                    raw_repository_id,
                    job_id=job_id,
                    error="Invalid repository manifest payload.",
                )
            raise

        log = log.bind(repository_id=manifest.repository_id, commit_sha=manifest.commit_sha)
        ingestion_start_time = time.monotonic()
        log.info(
            "ingestion_started",
            repository_id=manifest.repository_id,
            commit_sha=manifest.commit_sha,
            files_discovered=len(manifest.files),
        )

        heartbeat_stop = asyncio.Event()
        heartbeat_task = asyncio.create_task(
            self._heartbeat_loop(manifest.repository_id, job_id, heartbeat_stop)
        )

        try:
            # 1. Document Processing Stage (offloaded to thread pool)
            t0 = time.monotonic()
            await self._transition(
                manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.DOCUMENT_PROCESSING,
                commit_sha=manifest.commit_sha,
                file_count=len(manifest.files),
            )
            documents = await asyncio.to_thread(self._document_processor.process_manifest, manifest)
            doc_duration = round((time.monotonic() - t0) * 1000, 2)
            log.info(
                "document_processing_completed",
                files_discovered=len(manifest.files),
                files_filtered=len(documents),
                duration_ms=doc_duration,
            )

            # 2. AST Chunking Stage (offloaded to thread pool)
            t0 = time.monotonic()
            await self._transition(
                manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.CHUNKING,
            )
            chunks = await asyncio.to_thread(
                build_chunks_for_documents, documents, self._chunker, self._metadata_generator
            )
            chunk_duration = round((time.monotonic() - t0) * 1000, 2)
            log.info(
                "chunking_completed",
                chunks_created=len(chunks),
                duration_ms=chunk_duration,
            )

            # 3. Embedding Stage
            t0 = time.monotonic()
            await self._transition(
                manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.EMBEDDING,
            )
            embeddings = await embed_with_cache(chunks, self._embedder, self._embedding_cache)
            embed_duration = round((time.monotonic() - t0) * 1000, 2)
            log.info(
                "embedding_completed",
                chunks_embedded=len(embeddings),
                duration_ms=embed_duration,
            )

            # 4. ChromaDB Vector Storage Stage
            t0 = time.monotonic()
            await self._transition(
                manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.PROCESSING,
                stage=ProcessingStage.INDEXING,
            )
            await self._chroma.upsert_chunks(manifest.repository_id, chunks, embeddings)
            chroma_duration = round((time.monotonic() - t0) * 1000, 2)
            log.info(
                "chromadb_completed",
                vectors_upserted=len(embeddings),
                duration_ms=chroma_duration,
            )

            # 5. Ready & Webhook Notification Stage
            t0 = time.monotonic()
            await self._transition(
                manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.READY,
                stage=None,
                chunk_count=len(chunks),
            )
            webhook_duration = round((time.monotonic() - t0) * 1000, 2)
            total_duration = round((time.monotonic() - ingestion_start_time) * 1000, 2)

            log.info(
                "ingestion_completed",
                repository_id=manifest.repository_id,
                commit_sha=manifest.commit_sha,
                document_count=len(documents),
                chunk_count=len(chunks),
                total_duration_ms=total_duration,
                webhook_duration_ms=webhook_duration,
            )
        except AttemptSupersededError as sup_exc:
            total_duration = round((time.monotonic() - ingestion_start_time) * 1000, 2)
            log.warning(
                "ingestion_worker.attempt_superseded_aborted",
                repository_id=manifest.repository_id,
                job_id=job_id,
                reason=str(sup_exc),
                duration_ms=total_duration,
            )
            # Abort execution immediately and cleanly: do NOT mark FAILED
            # because a newer attempt owns the repository.
            return
        except asyncio.CancelledError:
            total_duration = round((time.monotonic() - ingestion_start_time) * 1000, 2)
            log.warning(
                "ingestion_worker.processing_cancelled",
                repository_id=manifest.repository_id,
                job_id=job_id,
                duration_ms=total_duration,
            )
            with contextlib.suppress(BaseException):
                await self._mark_failed(
                    manifest.repository_id,
                    job_id=job_id,
                    error="Ingestion cancelled during service shutdown or restart.",
                )
            raise
        except Exception as exc:
            total_duration = round((time.monotonic() - ingestion_start_time) * 1000, 2)
            log.error(
                "ingestion_worker.processing_failed",
                error=str(exc),
                duration_ms=total_duration,
            )
            with contextlib.suppress(AttemptSupersededError):
                await self._mark_failed(manifest.repository_id, job_id=job_id, error=str(exc))
            raise
        finally:
            heartbeat_stop.set()
            heartbeat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await heartbeat_task

    async def _heartbeat_loop(
        self, repository_id: str, job_id: str | None, stop_event: asyncio.Event
    ) -> None:
        """Periodically renews the liveness heartbeat lease in Redis and touches Express."""
        interval = (
            self._settings.ingestion_heartbeat_interval_seconds
            if self._settings is not None
            else 15.0
        )
        while not stop_event.is_set():
            try:
                await asyncio.sleep(interval)
                if stop_event.is_set():
                    break
                existing = await self._read_status(repository_id)
                if existing is None or (
                    job_id is not None and existing.job_id is not None and existing.job_id != job_id
                ):
                    # Superseded by newer attempt or record deleted
                    break
                now = datetime.now(UTC)

                success, reason = await self._cache_client.eval_atomic_status_transition(
                    status_key=f"{_STATUS_KEY_PREFIX}{repository_id}",
                    active_set_key="seis:active-ingestions",
                    expected_job_id=job_id,
                    new_record_json="",
                    ttl_seconds=_STATUS_TTL_SECONDS,
                    is_terminal=False,
                    repository_id=repository_id,
                    mode="heartbeat",
                    new_heartbeat_at=now.isoformat(),
                )
                if not success:
                    self._log.debug(
                        "ingestion_worker.heartbeat_rejected",
                        repository_id=repository_id,
                        job_id=job_id,
                        reason=reason,
                    )
                    break

                # Propagate heartbeat touch to Express/Mongo to prevent watchdog
                # timeout during long jobs
                if self._express_callback_client is not None:
                    with contextlib.suppress(Exception):
                        await self._express_callback_client.send_status_update(
                            repository_id=repository_id,
                            status=existing.status.value,
                            stage=existing.stage.value if existing.stage else None,
                            job_id=job_id,
                        )
            except asyncio.CancelledError:
                break
            except Exception as hb_exc:
                self._log.warning(
                    "ingestion_worker.heartbeat_update_failed",
                    repository_id=repository_id,
                    job_id=job_id,
                    error=str(hb_exc),
                )

    async def _mark_failed(
        self, repository_id: str, *, job_id: str | None = None, error: str
    ) -> None:
        await self._transition(
            repository_id,
            job_id=job_id,
            status=ProcessingStatus.FAILED,
            stage=None,
            error=error,
        )

    async def _transition(
        self,
        repository_id: str,
        *,
        job_id: str | None = None,
        status: ProcessingStatus,
        stage: ProcessingStage | None,
        commit_sha: str | None = None,
        error: str | None = None,
        file_count: int | None = None,
        chunk_count: int | None = None,
    ) -> None:
        """Updates the status record with atomic Lua CAS attempt fencing and
        durable callback staging."""
        existing = await self._read_status(repository_id)

        # Attempt Fencing: Fast local pre-check against superseding attempt
        if (
            existing is not None
            and job_id is not None
            and existing.job_id is not None
            and existing.job_id != job_id
        ):
            self._log.warning(
                "ingestion_worker.attempt_superseded",
                repository_id=repository_id,
                current_job_id=job_id,
                newer_job_id=existing.job_id,
                status=existing.status.value,
            )
            raise AttemptSupersededError(repository_id, job_id, "local_job_id_mismatch")

        now = datetime.now(UTC)
        effective_job_id = job_id or (existing.job_id if existing else None)
        record = ProcessingStatusRecord(
            repository_id=repository_id,
            job_id=effective_job_id,
            status=status,
            stage=stage,
            commit_sha=commit_sha
            if commit_sha is not None
            else (existing.commit_sha if existing else ""),
            started_at=existing.started_at if existing else now,
            updated_at=now,
            heartbeat_at=now,
            error=error,
            file_count=file_count
            if file_count is not None
            else (existing.file_count if existing else None),
            chunk_count=chunk_count
            if chunk_count is not None
            else (existing.chunk_count if existing else None),
        )

        is_terminal = status in (ProcessingStatus.READY, ProcessingStatus.FAILED)
        status_key = f"{_STATUS_KEY_PREFIX}{repository_id}"
        active_set_key = "seis:active-ingestions"

        callback_payload = {
            "repository_id": repository_id,
            "job_id": record.job_id,
            "status": status.value,
            "stage": stage.value if stage else None,
            "chunk_count": record.chunk_count or 0,
            "file_count": record.file_count or 0,
            "error": record.error,
        }
        callback_json = json.dumps(callback_payload) if is_terminal else None

        # Atomic CAS via Lua script with atomic pending callback staging
        success, reason = await self._cache_client.eval_atomic_status_transition(
            status_key=status_key,
            active_set_key=active_set_key,
            expected_job_id=effective_job_id,
            new_record_json=record.model_dump_json(),
            ttl_seconds=_STATUS_TTL_SECONDS,
            is_terminal=is_terminal,
            repository_id=repository_id,
            mode="transition",
            pending_callback_payload=callback_json,
        )

        if not success:
            self._log.warning(
                "ingestion_worker.transition_rejected_by_redis",
                repository_id=repository_id,
                job_id=effective_job_id,
                reason=reason,
            )
            raise AttemptSupersededError(repository_id, effective_job_id, reason)

        if self._express_callback_client is not None:
            try:
                sent = await self._express_callback_client.send_status_update(
                    repository_id=repository_id,
                    status=status.value,
                    stage=stage.value if stage else None,
                    chunk_count=record.chunk_count or 0,
                    file_count=record.file_count or 0,
                    error=record.error,
                    job_id=record.job_id,
                )
                if sent and is_terminal:
                    with contextlib.suppress(Exception):
                        await self._cache_client.acknowledge_pending_callback(
                            repository_id, job_id=record.job_id
                        )
            except Exception as exc:
                self._log.warning("ingestion_worker.express_callback_failed", error=str(exc))

    async def _read_status(self, repository_id: str) -> ProcessingStatusRecord | None:
        raw = await self._cache_client.get_cache(f"{_STATUS_KEY_PREFIX}{repository_id}")
        if raw is None:
            return None
        return ProcessingStatusRecord.model_validate_json(raw)
