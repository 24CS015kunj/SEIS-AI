"""Repository Processing Service orchestration (Task 30, Task T5, §6.1, §22).

Orchestrates repository ingestion job submission, bounded admission, attempt fencing,
and status tracking using managed in-process asynchronous execution (Architecture E):
- Redis distributed locking guards against concurrent double-submission races.
- IngestionJobManager executes the document-processing/chunking/embedding/indexing
  pipeline in-process within FastAPI lifespan with bounded concurrency.
- Atomic persistence-before-execution guarantees the initial PENDING status and
  attempt identity (job_id) are durable before execution starts.
- Renewable heartbeat leases fence stale attempts and enable automated recovery.
- Bounded active-job indexing in Redis allows fast reconciliation without KEYS scans.
"""

from __future__ import annotations

import contextlib
import json
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from app.config.settings import Settings, get_settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError, RepositoryNotFoundError
from app.domain.models import JobSubmissionResult, ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.infra.http.express_client import ExpressCallbackClient

if TYPE_CHECKING:
    from app.services.job_manager import IngestionJobManager

logger = structlog.get_logger("seis.services.repository_processing")

_LOCK_KEY_PREFIX = "seis:repo-processing-lock:"
_STATUS_KEY_PREFIX = "seis:repo-processing-status:"
_ACTIVE_INGESTIONS_KEY = "seis:active-ingestions"

_LOCK_TIMEOUT_SECONDS = 10
_STATUS_TTL_SECONDS = 21_600

_IN_FLIGHT_STATUSES = frozenset(
    {
        ProcessingStatus.PENDING,
        ProcessingStatus.QUEUED,
        ProcessingStatus.PROCESSING,
        ProcessingStatus.UPDATING,
    }
)


class RepositoryProcessingService:
    """Orchestrates repository ingestion job submission and status queries
    with in-process execution and attempt fencing."""

    def __init__(
        self,
        cache_client: RedisClient,
        job_manager: IngestionJobManager | None = None,
        express_callback_client: ExpressCallbackClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._cache_client = cache_client
        self._job_manager = job_manager
        self._express_callback_client = express_callback_client
        self.settings = settings or get_settings()
        self._log = logger.bind(component="repository_processing_service")

    # ------------------------------------------------------------------
    # Subtasks: submit_ingestion_job
    # ------------------------------------------------------------------
    async def submit_ingestion_job(self, manifest: RepositoryManifest) -> JobSubmissionResult:
        """Enqueues a repository for in-process background ingestion.

        Guarantees:
        1. Atomic submission guard: distributed lock prevents concurrent double-submission.
        2. Stale attempt recovery: timed-out in-flight attempts are automatically reconciled.
        3. Admission bounding: rejects work when capacity is exhausted or service is shutting down.
        4. Persistence-before-execution: initial PENDING status and attempt ID are durably saved
           in Redis before background task execution begins.
        """
        log = self._log.bind(repository_id=manifest.repository_id)
        lock_name = f"{_LOCK_KEY_PREFIX}{manifest.repository_id}"
        status_key = f"{_STATUS_KEY_PREFIX}{manifest.repository_id}"

        async with self._cache_client.acquire_lock(
            lock_name, timeout=_LOCK_TIMEOUT_SECONDS
        ) as acquired:
            if not acquired:
                log.warning("repository_processing.submission_conflict", reason="lock_held")
                raise BusinessError(
                    f"Repository {manifest.repository_id!r} is already undergoing processing.",
                    details={"repository_id": manifest.repository_id},
                )

            existing = await self._read_status(manifest.repository_id)
            if existing is not None and existing.status in _IN_FLIGHT_STATUSES:
                if self._is_attempt_stale(existing):
                    log.info(
                        "repository_processing.stale_attempt_detected",
                        stale_job_id=existing.job_id,
                        status=existing.status.value,
                    )
                    await self._reconcile_stale_record(existing)
                else:
                    log.warning(
                        "repository_processing.submission_conflict",
                        reason="status_in_flight",
                        current_status=existing.status.value,
                        job_id=existing.job_id,
                    )
                    raise BusinessError(
                        f"Repository {manifest.repository_id!r} is already "
                        f"{existing.status.value} -- resubmit once it reaches a terminal status.",
                        details={
                            "repository_id": manifest.repository_id,
                            "current_status": existing.status.value,
                            "job_id": existing.job_id,
                        },
                    )

            # 1. Mint a unique attempt identity
            job_id = f"job_{uuid.uuid4().hex[:16]}"
            now = datetime.now(UTC)

            # 2. Reserve admission capacity in JobManager first
            if self._job_manager is not None:
                self._job_manager.reserve_admission(manifest.repository_id, job_id)

            record = ProcessingStatusRecord(
                repository_id=manifest.repository_id,
                job_id=job_id,
                status=ProcessingStatus.PENDING,
                stage=None,
                commit_sha=manifest.commit_sha,
                started_at=now,
                updated_at=now,
                heartbeat_at=now,
                error=None,
                file_count=len(manifest.files),
                chunk_count=None,
            )

            # 3. Durably persist initial status in Redis BEFORE task execution via atomic CAS
            try:
                success, reason = await self._cache_client.eval_atomic_status_transition(
                    status_key=status_key,
                    active_set_key=_ACTIVE_INGESTIONS_KEY,
                    expected_job_id="",
                    new_record_json=record.model_dump_json(),
                    ttl_seconds=_STATUS_TTL_SECONDS,
                    is_terminal=False,
                    repository_id=manifest.repository_id,
                    mode="transition",
                )
                if not success:
                    if reason == "job_already_in_flight":
                        raise BusinessError(
                            f"Repository {manifest.repository_id!r} is currently processing an active ingestion job.",
                            details={"repository_id": manifest.repository_id},
                        )
                    msg = (
                        f"Atomic persistence rejected for repository "
                        f"{manifest.repository_id!r}: {reason}"
                    )
                    raise QueueError(msg)
            except BusinessError:
                if self._job_manager is not None:
                    self._job_manager.release_admission(job_id)
                raise
            except Exception as exc:
                if self._job_manager is not None:
                    self._job_manager.release_admission(job_id)
                log.error("repository_processing.initial_persistence_failed", error=str(exc))
                raise QueueError(
                    f"Failed to persist initial status for repository {manifest.repository_id!r}",
                    details={"repository_id": manifest.repository_id},
                ) from exc

            # 4. Dispatch to IngestionJobManager
            if self._job_manager is not None:
                try:
                    self._job_manager.submit_job(manifest, job_id)
                except Exception as exc:
                    self._job_manager.release_admission(job_id)
                    with contextlib.suppress(Exception):
                        await self._cache_client.eval_atomic_delete_attempt(
                            status_key=status_key,
                            active_set_key=_ACTIVE_INGESTIONS_KEY,
                            expected_job_id=job_id,
                            repository_id=manifest.repository_id,
                        )
                    log.error("repository_processing.dispatch_failed", error=str(exc))
                    msg = (
                        f"Failed to dispatch ingestion job for repository "
                        f"{manifest.repository_id!r}"
                    )
                    raise QueueError(
                        msg,
                        details={"repository_id": manifest.repository_id},
                    ) from exc

        log.info("repository_processing.job_submitted", job_id=job_id)
        return JobSubmissionResult(
            repository_id=manifest.repository_id,
            job_id=job_id,
            status=ProcessingStatus.PENDING,
            submitted_at=now,
        )

    # ------------------------------------------------------------------
    # Liveness & Reconciliation
    # ------------------------------------------------------------------
    def _is_attempt_stale(self, record: ProcessingStatusRecord) -> bool:
        """Determines if an in-flight status record is considered timed out."""
        now = datetime.now(UTC)
        if record.heartbeat_at is not None:
            elapsed = (now - record.heartbeat_at).total_seconds()
            return elapsed > self.settings.ingestion_heartbeat_timeout_seconds
        # Fallback for legacy records without heartbeat
        elapsed = (now - record.updated_at).total_seconds()
        return elapsed > 300.0

    async def _reconcile_stale_record(self, record: ProcessingStatusRecord) -> bool:
        """Reconciles an expired attempt across Redis and Express using atomic CAS."""
        now = datetime.now(UTC)
        timeout_msg = (
            "Previous ingestion attempt timed out or was interrupted by service restart."
        )
        failed_record = record.model_copy(
            update={
                "status": ProcessingStatus.FAILED,
                "stage": None,
                "updated_at": now,
                "error": timeout_msg,
            }
        )
        status_key = f"{_STATUS_KEY_PREFIX}{record.repository_id}"

        callback_payload = {
            "repository_id": record.repository_id,
            "job_id": record.job_id,
            "status": ProcessingStatus.FAILED.value,
            "stage": None,
            "chunk_count": record.chunk_count or 0,
            "file_count": record.file_count or 0,
            "error": timeout_msg,
        }
        callback_json = json.dumps(callback_payload)

        # Atomic CAS with heartbeat lease check and atomic pending callback staging
        expected_hb = record.heartbeat_at.isoformat() if record.heartbeat_at else ""
        success, reason = await self._cache_client.eval_atomic_status_transition(
            status_key=status_key,
            active_set_key=_ACTIVE_INGESTIONS_KEY,
            expected_job_id=record.job_id,
            new_record_json=failed_record.model_dump_json(),
            ttl_seconds=_STATUS_TTL_SECONDS,
            is_terminal=True,
            repository_id=record.repository_id,
            mode="reconcile",
            expected_heartbeat_at=expected_hb,
            pending_callback_payload=callback_json,
        )
        if not success:
            self._log.warning(
                "repository_processing.reconciliation_cas_rejected",
                repository_id=record.repository_id,
                job_id=record.job_id,
                reason=reason,
            )
            return False

        if self._express_callback_client is not None:
            try:
                sent = await self._express_callback_client.send_status_update(
                    repository_id=record.repository_id,
                    status=ProcessingStatus.FAILED.value,
                    stage=None,
                    chunk_count=record.chunk_count or 0,
                    file_count=record.file_count or 0,
                    error=timeout_msg,
                    job_id=record.job_id,
                )
                if sent:
                    with contextlib.suppress(Exception):
                        await self._cache_client.acknowledge_pending_callback(
                            record.repository_id, job_id=record.job_id
                        )
            except Exception as exc:
                self._log.warning(
                    "repository_processing.reconciliation_callback_failed",
                    repository_id=record.repository_id,
                    error=str(exc),
                )
        return True

    async def reconcile_interrupted_jobs(self) -> int:
        """Startup catch-up: discovers and reconciles genuinely orphaned jobs using cursor SSCAN."""
        reconciled = 0
        try:
            cursor = 0
            while True:
                cursor, members = await self._cache_client.sscan_members(
                    _ACTIVE_INGESTIONS_KEY, cursor=cursor, count=100
                )
                for member in members:
                    repo_id = str(member)
                    existing = await self._read_status(repo_id)
                    if existing is not None and existing.status in _IN_FLIGHT_STATUSES:
                        # Ownership & Liveness Check: Reconcile ONLY genuinely stale jobs
                        if self._is_attempt_stale(existing):
                            self._log.info(
                                "repository_processing.reconciling_orphaned_job",
                                repository_id=repo_id,
                                job_id=existing.job_id,
                            )
                            reconciled_ok = await self._reconcile_stale_record(existing)
                            if reconciled_ok:
                                reconciled += 1
                        else:
                            self._log.debug(
                                "repository_processing.skipping_fresh_active_job",
                                repository_id=repo_id,
                                job_id=existing.job_id,
                            )
                    else:
                        with contextlib.suppress(Exception):
                            await self._cache_client.remove_from_set(
                                _ACTIVE_INGESTIONS_KEY, repo_id
                            )
                if cursor == 0:
                    break
        except Exception as exc:
            self._log.error("repository_processing.startup_reconciliation_failed", error=str(exc))

        # Durable callback delivery catch-up: flush any undelivered callbacks staged in Redis
        with contextlib.suppress(Exception):
            flushed = await self.flush_pending_callbacks()
            if flushed:
                self._log.info("repository_processing.flushed_pending_callbacks", count=flushed)

        return reconciled

    async def flush_pending_callbacks(self) -> int:
        """Flushes and retries pending undelivered terminal callbacks from Redis."""
        flushed = 0
        if self._express_callback_client is None:
            return 0

        pending_set_key = "seis:pending-callback-deliveries"
        cursor = 0
        while True:
            cursor, members = await self._cache_client.sscan_members(
                pending_set_key, cursor=cursor, count=100
            )
            for member in members:
                delivery_id = str(member)
                if ":" in delivery_id:
                    repo_id, job_id_from_member = delivery_id.split(":", 1)
                else:
                    repo_id, job_id_from_member = delivery_id, None

                raw_payload = await self._cache_client.get_pending_callback(
                    repo_id, job_id=job_id_from_member
                )
                if not raw_payload:
                    with contextlib.suppress(Exception):
                        await self._cache_client.acknowledge_pending_callback(
                            repo_id, job_id=job_id_from_member
                        )
                    continue

                try:
                    payload = json.loads(raw_payload)
                    job_id = payload.get("job_id") or job_id_from_member

                    # Verify attempt ownership: if current record has a newer job, drop stale
                    # callback
                    current_status = await self._read_status(repo_id)
                    if (
                        current_status is not None
                        and job_id is not None
                        and current_status.job_id is not None
                        and current_status.job_id != job_id
                    ):
                        self._log.info(
                            "repository_processing.pending_callback_superseded",
                            repository_id=repo_id,
                            stale_job_id=job_id,
                            current_job_id=current_status.job_id,
                        )
                        await self._cache_client.acknowledge_pending_callback(
                            repo_id, job_id=job_id
                        )
                        continue

                    sent = await self._express_callback_client.send_status_update(
                        repository_id=repo_id,
                        status=payload.get("status", ProcessingStatus.FAILED.value),
                        stage=payload.get("stage"),
                        chunk_count=payload.get("chunk_count", 0),
                        file_count=payload.get("file_count", 0),
                        error=payload.get("error"),
                        job_id=job_id,
                    )
                    if sent:
                        await self._cache_client.acknowledge_pending_callback(
                            repo_id, job_id=job_id
                        )
                        flushed += 1
                except Exception as flush_err:
                    self._log.warning(
                        "repository_processing.flush_pending_callback_failed",
                        repository_id=repo_id,
                        error=str(flush_err),
                    )

            if cursor == 0:
                break

        return flushed

    # ------------------------------------------------------------------
    # Status Queries
    # ------------------------------------------------------------------
    async def get_processing_status(self, repository_id: str) -> ProcessingStatusRecord:
        """Returns the persisted processing status for ``repository_id``."""
        record = await self._read_status(repository_id)
        if record is None:
            self._log.info("repository_processing.status_not_found", repository_id=repository_id)
            raise RepositoryNotFoundError(
                f"No processing status found for repository {repository_id!r}.",
                details={"repository_id": repository_id},
            )
        self._log.debug(
            "repository_processing.status_queried",
            repository_id=repository_id,
            status=record.status.value,
            job_id=record.job_id,
        )
        return record

    async def _read_status(self, repository_id: str) -> ProcessingStatusRecord | None:
        raw = await self._cache_client.get_cache(f"{_STATUS_KEY_PREFIX}{repository_id}")
        if raw is None:
            return None
        return ProcessingStatusRecord.model_validate_json(raw)
