"""Repository Processing Service orchestration (Task 30, §6.1, §22).

Orchestrates repository ingestion job submission and status tracking:
Redis distributed locking (Task 10, ADR-005) guards against
double-submission, Celery (Task 11, ADR-005) is where the actual
document-processing/chunking/embedding/indexing pipeline (Tasks 13-17,
Phase 3) eventually runs, once a background worker exists to consume
it (Task 40, Phase 8).

Lock vs. status -- two distinct Redis-backed concepts, not one:
``RedisClient.acquire_lock`` (Task 10) is a short-lived, non-blocking,
context-manager-scoped primitive -- by design it cannot represent
"this repository is undergoing processing" for the multi-minute
duration of a real ingestion job, because nothing holds it open that
long (the request that calls :meth:`submit_ingestion_job` returns
immediately, per this task's own Validation criterion). Here, the lock
is held only for the brief atomic "check current status, then persist
a new PENDING one" critical section inside
:meth:`RepositoryProcessingService.submit_ingestion_job` -- it prevents
two concurrent submissions from racing past the status check
simultaneously. The actual "is this repository currently processing"
signal that survives across requests (and across the lock's own short
lifetime) is the persisted :class:`~app.domain.models.ProcessingStatusRecord`
JSON stored under a TTL-bound cache key -- the TTL itself is what
satisfies this task's own "Common Mistakes: leaving repository state
stuck in PROCESSING if background tasks crash" warning, since a crashed
worker that never updates the record still has it expire eventually
rather than blocking resubmission forever.

Celery task name -- forward reference to Task 40: no
``@celery_app.task``-decorated function exists anywhere in this
codebase yet (Task 11's ``app.infra.queue.task_queue`` module docstring
is explicit that task *bodies* are out of its scope, and Phase 6's own
Phase Scope excludes "Celery background worker execution loops (Phase
8)"). Celery's producer API does not require the task to be locally
registered to dispatch it -- ``Celery.send_task(name, args=...)``
enqueues a message addressed to ``name`` on the broker; a worker only
needs that registration to *consume* it. ``_INGESTION_TASK_NAME`` below
is therefore a contract this module enqueues against today and Task 40
must register a worker task under, exactly matching
``task_queue.py``'s existing ``"app.tasks.ingestion.*"`` queue-routing
pattern so the dispatched message lands on the right queue immediately,
without Task 40 needing to touch routing config.

Sync/async boundary: ``Celery.send_task`` is a blocking call (kombu has
no asyncio transport -- see ``task_queue.py``'s own module docstring).
Dispatched via ``asyncio.to_thread``, the same pattern
``check_broker_connection`` already established, so a slow/unreachable
broker never blocks the event loop.

Naming reconciliation: Task 30's own spec text names its dependencies
as ``app.infra.queue.celery_redis``/``app.infra.cache.redis_client``
and its status method's return type as ``ProcessingStatusResponse``.
The real modules are ``app.infra.queue.task_queue``/
``app.infra.cache.cache_client`` (Tasks 11/10's actual frozen file
names), and :class:`~app.domain.models.ProcessingStatusRecord` (Task 7)
already models exactly what a status response needs (repository_id,
status, stage, commit_sha, timestamps, error, file/chunk counts) --
reused here rather than defining a near-duplicate
``ProcessingStatusResponse`` alongside it, the same "don't invent a
parallel shape for something that already exists" reasoning used
throughout this codebase for genuine gaps in the other direction.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from celery import Celery  # type: ignore[import-untyped]

from app.config.settings import Settings, get_settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError, RepositoryNotFoundError
from app.domain.models import JobSubmissionResult, ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient

logger = structlog.get_logger("seis.services.repository_processing")

# Forward reference to the Celery task Task 40's worker must register
# (see module docstring). Matches task_queue.py's "app.tasks.ingestion.*"
# routing pattern so this message is routed onto the "ingestion" queue
# even though no consumer exists yet.
_INGESTION_TASK_NAME = "app.tasks.ingestion.process_repository"
_INGESTION_QUEUE_NAME = "ingestion"

# Redis key namespacing (cache_client.py explicitly leaves this to
# callers -- no convention is defined at the adapter level).
_LOCK_KEY_PREFIX = "seis:repo-processing-lock:"
_STATUS_KEY_PREFIX = "seis:repo-processing-status:"

# Held only long enough to check-then-set the status record atomically
# (see module docstring) -- not the duration of the ingestion job itself.
_LOCK_TIMEOUT_SECONDS = 10

# Safety-net TTL on the persisted status record itself: bounds how long
# a repository can appear "stuck" in PENDING/PROCESSING if the worker
# that was supposed to update it (Task 40) crashes without ever writing
# a terminal READY/FAILED status. Deliberately generous (6h) -- large
# repositories may legitimately take a while to process; this is a
# ceiling against permanent staleness, not a normal-path timeout.
_STATUS_TTL_SECONDS = 21_600

# Statuses that mean "a submission already exists and is still live" --
# resubmission is rejected while status is one of these. READY/FAILED/
# ARCHIVED/DELETED/RECOVERY/ROLLBACK are all terminal or otherwise not
# "currently processing" and must not block a fresh submission (e.g.
# retrying after FAILED).
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
    (Task 30 subtasks 1-5)."""

    def __init__(
        self,
        cache_client: RedisClient,
        task_queue: Celery,
        settings: Settings | None = None,
    ) -> None:
        self._cache_client = cache_client
        self._task_queue = task_queue
        self.settings = settings or get_settings()
        self._log = logger.bind(component="repository_processing_service")

    # ------------------------------------------------------------------
    # Subtasks 2-4: submit_ingestion_job
    # ------------------------------------------------------------------
    async def submit_ingestion_job(self, manifest: RepositoryManifest) -> JobSubmissionResult:
        """Enqueues a repository for ingestion (Task 30 subtasks 2-4).

        Raises:
            BusinessError: ``manifest.repository_id`` is already
                undergoing processing (a concurrent submission holds the
                lock, or a live status record already exists).
            QueueError: The Celery broker rejected/failed the dispatch.
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
                log.warning(
                    "repository_processing.submission_conflict",
                    reason="status_in_flight",
                    current_status=existing.status.value,
                )
                raise BusinessError(
                    f"Repository {manifest.repository_id!r} is already "
                    f"{existing.status.value} -- resubmit once it reaches a terminal status.",
                    details={
                        "repository_id": manifest.repository_id,
                        "current_status": existing.status.value,
                    },
                )

            job_id = await self._enqueue(manifest)
            now = datetime.now(UTC)
            record = ProcessingStatusRecord(
                repository_id=manifest.repository_id,
                status=ProcessingStatus.PENDING,
                stage=None,
                commit_sha=manifest.commit_sha,
                started_at=now,
                updated_at=now,
                error=None,
                file_count=len(manifest.files),
                chunk_count=None,
            )
            await self._cache_client.set_cache(
                status_key, record.model_dump_json(), _STATUS_TTL_SECONDS
            )

        log.info("repository_processing.job_submitted", job_id=job_id)
        return JobSubmissionResult(
            repository_id=manifest.repository_id,
            job_id=job_id,
            status=ProcessingStatus.PENDING,
            submitted_at=now,
        )

    async def _enqueue(self, manifest: RepositoryManifest) -> str:
        """Dispatches the ingestion job to Celery off-thread (module
        docstring: ``send_task`` is a blocking kombu call)."""

        def _dispatch() -> str:
            result = self._task_queue.send_task(
                _INGESTION_TASK_NAME,
                args=[manifest.model_dump(mode="json")],
                queue=_INGESTION_QUEUE_NAME,
            )
            return str(result.id)

        try:
            return await asyncio.to_thread(_dispatch)
        except Exception as exc:
            self._log.error(
                "repository_processing.enqueue_failed",
                repository_id=manifest.repository_id,
                error=str(exc),
            )
            raise QueueError(
                f"Failed to enqueue ingestion job for repository {manifest.repository_id!r}",
                details={"repository_id": manifest.repository_id},
            ) from exc

    # ------------------------------------------------------------------
    # Subtask 5: get_processing_status
    # ------------------------------------------------------------------
    async def get_processing_status(self, repository_id: str) -> ProcessingStatusRecord:
        """Returns the persisted processing status for ``repository_id``.

        Raises:
            RepositoryNotFoundError: No status record exists -- the
                repository was never submitted, or its record's TTL
                (:data:`_STATUS_TTL_SECONDS`) already expired.
        """
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
        )
        return record

    async def _read_status(self, repository_id: str) -> ProcessingStatusRecord | None:
        raw = await self._cache_client.get_cache(f"{_STATUS_KEY_PREFIX}{repository_id}")
        if raw is None:
            return None
        return ProcessingStatusRecord.model_validate_json(raw)
