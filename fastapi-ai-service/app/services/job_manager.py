"""In-process Background Ingestion Job Manager (Task T5, Architecture E).

Replaces Celery and its separate worker process with managed in-process
asynchronous execution within the FastAPI application lifespan:
- Retains strong references to every running task (prevents garbage collection).
- Bounded concurrency via Semaphore (default: 2 active jobs).
- Bounded admission capacity (default: 10 admitted jobs, including waiting).
- Fast request acceptance: accepts and persists initial status before execution.
- Exception retrieval and structured logging per job.
- Clean cancellation and bounded grace-period shutdown.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import structlog

from app.config.settings import Settings, get_settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import QueueError
from app.domain.models import ProcessingStatusRecord, RepositoryManifest

if TYPE_CHECKING:
    from app.infra.cache.cache_client import RedisClient
    from app.infra.http.express_client import ExpressCallbackClient

logger = structlog.get_logger("seis.services.job_manager")


class IngestionJobManager:
    """Manages lifecycle, bounded admission, and in-process execution of
    asynchronous repository ingestion tasks."""

    def __init__(
        self,
        worker_factory: Callable[[], Any],
        settings: Settings | None = None,
        cache_client: RedisClient | None = None,
        express_callback_client: ExpressCallbackClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._worker_factory = worker_factory
        self._cache_client = cache_client
        self._express_callback_client = express_callback_client
        self._log = logger.bind(component="ingestion_job_manager")

        # Concurrency & Admission Bounds
        self._semaphore = asyncio.Semaphore(self._settings.max_concurrent_ingestion_jobs)
        self._max_admitted = self._settings.max_admitted_ingestion_jobs

        # Task & Admission Tracking
        self._active_tasks: dict[str, asyncio.Task[None]] = {}
        self._admitted_jobs: dict[str, str] = {}  # job_id -> repository_id

        # Lifecycle State
        self._accepting: bool = True
        self._shutting_down: bool = False
        self._recovery_task: asyncio.Task[None] | None = None

    @property
    def is_accepting(self) -> bool:
        """Returns True if the manager is currently accepting new work."""
        return self._accepting

    @property
    def active_job_count(self) -> int:
        """Number of tasks currently executing or waiting in the active task pool."""
        return len(self._active_tasks)

    @property
    def admitted_job_count(self) -> int:
        """Total admitted jobs (currently running + waiting on semaphore)."""
        return len(self._admitted_jobs)

    # ------------------------------------------------------------------
    # Admission Control
    # ------------------------------------------------------------------
    def reserve_admission(self, repository_id: str, job_id: str) -> None:
        """Reserves a slot in the admitted job queue before persisting status.

        Raises:
            QueueError: If the manager is shutting down or maximum capacity
                has been reached.
        """
        if not self._accepting:
            self._log.warning(
                "job_manager.admission_rejected_shutting_down",
                repository_id=repository_id,
                job_id=job_id,
            )
            raise QueueError(
                "Service is shutting down; new ingestion jobs cannot be accepted.",
                details={"repository_id": repository_id, "job_id": job_id},
            )

        if len(self._admitted_jobs) >= self._max_admitted:
            self._log.warning(
                "job_manager.admission_capacity_exceeded",
                repository_id=repository_id,
                job_id=job_id,
                current_admitted=len(self._admitted_jobs),
                max_admitted=self._max_admitted,
            )
            raise QueueError(
                f"Maximum background ingestion capacity reached ({self._max_admitted} jobs). "
                "Please retry your request later.",
                details={
                    "repository_id": repository_id,
                    "job_id": job_id,
                    "current_admitted": len(self._admitted_jobs),
                    "max_admitted": self._max_admitted,
                },
            )

        self._admitted_jobs[job_id] = repository_id
        self._log.info(
            "job_manager.admission_reserved",
            repository_id=repository_id,
            job_id=job_id,
            admitted_count=len(self._admitted_jobs),
        )

    def release_admission(self, job_id: str) -> None:
        """Releases a reserved slot (called on cleanup or job completion)."""
        repo_id = self._admitted_jobs.pop(job_id, None)
        if repo_id:
            self._log.debug(
                "job_manager.admission_released",
                repository_id=repo_id,
                job_id=job_id,
                admitted_count=len(self._admitted_jobs),
            )

    # ------------------------------------------------------------------
    # Job Submission & Execution
    # ------------------------------------------------------------------
    def submit_job(self, manifest: RepositoryManifest, job_id: str) -> None:
        """Schedules the manifest for in-process background execution.

        Must only be called after `reserve_admission` and initial status
        persistence in Redis have succeeded.
        """
        if not self._accepting:
            self.release_admission(job_id)
            raise QueueError(
                "Service is shutting down; cannot schedule ingestion task.",
                details={"repository_id": manifest.repository_id, "job_id": job_id},
            )

        task = asyncio.create_task(
            self._run_job(manifest, job_id),
            name=f"ingestion-{manifest.repository_id}-{job_id}",
        )
        self._active_tasks[job_id] = task

        # Callback cleans up strong reference and logs terminal results
        task.add_done_callback(lambda t: self._on_task_done(job_id, manifest.repository_id, t))

        self._log.info(
            "job_manager.task_scheduled",
            repository_id=manifest.repository_id,
            job_id=job_id,
            active_tasks=len(self._active_tasks),
        )

    async def _settle_unstarted_job(self, repository_id: str, job_id: str, error: str) -> None:
        """Atomically settles a job that failed before the worker service could execute."""
        if self._cache_client is not None:
            now = datetime.now(UTC)
            record = ProcessingStatusRecord(
                repository_id=repository_id,
                job_id=job_id,
                status=ProcessingStatus.FAILED,
                stage=None,
                commit_sha="",
                started_at=now,
                updated_at=now,
                heartbeat_at=now,
                error=error,
            )
            callback_payload = {
                "repository_id": repository_id,
                "job_id": job_id,
                "status": ProcessingStatus.FAILED.value,
                "stage": None,
                "chunk_count": 0,
                "file_count": 0,
                "error": error,
            }
            callback_json = json.dumps(callback_payload)

            with contextlib.suppress(Exception):
                await self._cache_client.eval_atomic_status_transition(
                    status_key=f"seis:repo-processing-status:{repository_id}",
                    active_set_key="seis:active-ingestions",
                    expected_job_id=job_id,
                    new_record_json=record.model_dump_json(),
                    ttl_seconds=21600,
                    is_terminal=True,
                    repository_id=repository_id,
                    mode="transition",
                    pending_callback_payload=callback_json,
                )

        if self._express_callback_client is not None:
            try:
                sent = await self._express_callback_client.send_status_update(
                    repository_id=repository_id,
                    status=ProcessingStatus.FAILED.value,
                    stage=None,
                    error=error,
                    job_id=job_id,
                )
                if sent and self._cache_client is not None:
                    with contextlib.suppress(Exception):
                        await self._cache_client.acknowledge_pending_callback(
                            repository_id, job_id=job_id
                        )
            except Exception as exc:
                self._log.warning(
                    "job_manager.settle_callback_failed",
                    repository_id=repository_id,
                    job_id=job_id,
                    error=str(exc),
                )

    async def _queued_heartbeat_loop(
        self, repository_id: str, job_id: str, stop_event: asyncio.Event
    ) -> None:
        """Periodically renews heartbeat while waiting in queue for a concurrency slot."""
        interval = self._settings.ingestion_heartbeat_interval_seconds
        while not stop_event.is_set():
            try:
                await asyncio.sleep(interval)
                if stop_event.is_set():
                    break
                if self._cache_client is not None:
                    raw = await self._cache_client.get_cache(
                        f"seis:repo-processing-status:{repository_id}"
                    )
                    if raw is None:
                        break
                    existing = ProcessingStatusRecord.model_validate_json(raw)
                    if existing.job_id != job_id or existing.status not in (
                        ProcessingStatus.PENDING,
                        ProcessingStatus.QUEUED,
                    ):
                        break
                    now = datetime.now(UTC)
                    success, reason = await self._cache_client.eval_atomic_status_transition(
                        status_key=f"seis:repo-processing-status:{repository_id}",
                        active_set_key="seis:active-ingestions",
                        expected_job_id=job_id,
                        new_record_json="",
                        ttl_seconds=21600,
                        is_terminal=False,
                        repository_id=repository_id,
                        mode="heartbeat",
                        new_heartbeat_at=now.isoformat(),
                    )
                    if not success:
                        self._log.debug(
                            "job_manager.queued_heartbeat_rejected",
                            repository_id=repository_id,
                            job_id=job_id,
                            reason=reason,
                        )
                        break

                if self._express_callback_client is not None:
                    with contextlib.suppress(Exception):
                        await self._express_callback_client.send_status_update(
                            repository_id=repository_id,
                            status="queued",
                            stage="queued",
                            job_id=job_id,
                        )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._log.warning(
                    "job_manager.queued_heartbeat_failed",
                    repository_id=repository_id,
                    job_id=job_id,
                    error=str(exc),
                )

    async def _run_job(self, manifest: RepositoryManifest, job_id: str) -> None:
        """Executes the ingestion pipeline under concurrency bounds."""
        log = self._log.bind(repository_id=manifest.repository_id, job_id=job_id)
        log.debug("job_manager.waiting_for_concurrency_slot")

        queued_stop = asyncio.Event()
        queued_heartbeat = asyncio.create_task(
            self._queued_heartbeat_loop(manifest.repository_id, job_id, queued_stop),
            name=f"queued-heartbeat-{manifest.repository_id}-{job_id}",
        )

        worker_service = None
        try:
            async with self._semaphore:
                queued_stop.set()
                queued_heartbeat.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await queued_heartbeat

                if not self._accepting and self._shutting_down:
                    log.warning("job_manager.job_aborted_during_shutdown")
                    await self._settle_unstarted_job(
                        manifest.repository_id,
                        job_id,
                        error=(
                            "Job aborted during service shutdown before acquiring execution slot."
                        ),
                    )
                    return

                log.info("job_manager.executing_job")
                try:
                    worker_service = self._worker_factory()
                except Exception as fact_err:
                    log.error("job_manager.worker_factory_failed", error=str(fact_err))
                    await self._settle_unstarted_job(
                        manifest.repository_id,
                        job_id,
                        error=f"Worker initialization failed: {fact_err}",
                    )
                    raise

                payload = manifest.model_dump(mode="json")
                await worker_service.process_ingestion_job(payload, job_id=job_id)
        except asyncio.CancelledError:
            log.warning("job_manager.job_cancelled")
            if worker_service is None:
                with contextlib.suppress(Exception):
                    await self._settle_unstarted_job(
                        manifest.repository_id,
                        job_id,
                        error="Job cancelled while queued waiting for concurrency slot.",
                    )
            raise
        except Exception as exc:
            log.error("job_manager.job_execution_failed", error=str(exc))
            raise
        finally:
            queued_stop.set()
            queued_heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await queued_heartbeat

    def _on_task_done(self, job_id: str, repository_id: str, task: asyncio.Task[None]) -> None:
        """Task completion handler: removes strong reference, releases slot,
        and retrieves unhandled exceptions."""
        self._active_tasks.pop(job_id, None)
        self.release_admission(job_id)

        if task.cancelled():
            self._log.warning(
                "job_manager.task_cancelled",
                repository_id=repository_id,
                job_id=job_id,
            )
            return

        exc = task.exception()
        if exc is not None:
            self._log.error(
                "job_manager.task_ended_with_exception",
                repository_id=repository_id,
                job_id=job_id,
                error=str(exc),
            )
        else:
            self._log.info(
                "job_manager.task_completed_successfully",
                repository_id=repository_id,
                job_id=job_id,
            )

    def start_background_recovery_loop(self, processing_service: Any) -> None:
        """Starts recurring background flush and reconciliation loop during app lifespan."""
        if self._recovery_task is None or self._recovery_task.done():
            self._recovery_task = asyncio.create_task(
                self._run_recovery_loop(processing_service),
                name="ingestion-background-recovery-loop",
            )

    async def _run_recovery_loop(self, processing_service: Any) -> None:
        while not self._shutting_down:
            try:
                interval = (
                    self._settings.ingestion_recovery_interval_seconds
                    if self.admitted_job_count
                    else self._settings.ingestion_recovery_idle_interval_seconds
                )
                await asyncio.sleep(interval)
                if self._shutting_down:
                    break
                # Reconciliation includes the callback flush; avoid a second scan.
                await processing_service.reconcile_interrupted_jobs()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._log.warning("job_manager.recovery_loop_tick_failed", error=str(exc))

    # ------------------------------------------------------------------
    # Graceful Lifespan Teardown
    # ------------------------------------------------------------------
    async def shutdown(self, timeout: float | None = None) -> None:
        """Gracefully halts job acceptance and waits for active jobs.

        1. Disables new admissions immediately.
        2. Grants active tasks a bounded grace period.
        3. Cancels any remaining tasks if they exceed the grace period.
        """
        grace_period = timeout or self._settings.ingestion_job_grace_period_seconds
        self._accepting = False
        self._shutting_down = True
        self._log.info(
            "job_manager.shutdown_started",
            active_tasks=len(self._active_tasks),
            grace_period_seconds=grace_period,
        )

        if self._recovery_task is not None:
            self._recovery_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._recovery_task
            self._recovery_task = None

        if not self._active_tasks:
            self._log.info("job_manager.shutdown_complete_no_active_tasks")
            return

        tasks = list(self._active_tasks.values())
        done, pending = await asyncio.wait(tasks, timeout=grace_period)

        if pending:
            self._log.warning(
                "job_manager.cancelling_uncompleted_tasks",
                pending_count=len(pending),
            )
            for t in pending:
                t.cancel()

            post_cancel_timeout = min(5.0, max(1.0, grace_period))
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending, return_exceptions=True),
                    timeout=post_cancel_timeout,
                )
            except TimeoutError:
                self._log.warning(
                    "job_manager.post_cancel_gather_timed_out",
                    unresponsive_tasks=len(pending),
                )

        self._active_tasks.clear()
        self._admitted_jobs.clear()
        self._log.info("job_manager.shutdown_complete")
