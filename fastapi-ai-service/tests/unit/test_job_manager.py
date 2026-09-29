"""Unit tests for app/services/job_manager.py (Task T5, Architecture E).

Verifies in-process background job management:
- Concurrency limiting via asyncio.Semaphore
- Admission capacity bounds and rejection
- Shutdown rejection and graceful task cancellation
- Strong reference retention and exception retrieval
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.config.settings import Settings
from app.domain.exceptions import QueueError
from app.domain.models import ManifestFile, RepositoryManifest
from app.services.job_manager import IngestionJobManager


def _manifest(repository_id: str = "repo-1") -> RepositoryManifest:
    return RepositoryManifest(
        repository_id=repository_id,
        workspace_id="ws-1",
        commit_sha="commit-abc",
        files=[
            ManifestFile(
                path="main.py",
                content=b"print('hello')",
                language="python",
                size_bytes=14,
            )
        ],
    )


class _MockWorkerService:
    def __init__(self, *, delay: float = 0.01, fail: bool = False) -> None:
        self.delay = delay
        self.fail = fail
        self.started_calls: list[tuple[dict[str, Any], str | None]] = []
        self.completed_calls: list[tuple[dict[str, Any], str | None]] = []
        self.concurrent_count = 0
        self.max_concurrent_seen = 0

    async def process_ingestion_job(
        self, payload: dict[str, Any], *, job_id: str | None = None
    ) -> None:
        self.started_calls.append((payload, job_id))
        self.concurrent_count += 1
        if self.concurrent_count > self.max_concurrent_seen:
            self.max_concurrent_seen = self.concurrent_count

        try:
            if self.delay > 0:
                await asyncio.sleep(self.delay)
            if self.fail:
                raise RuntimeError("simulated pipeline error")
        finally:
            self.concurrent_count -= 1
            self.completed_calls.append((payload, job_id))


@pytest.mark.asyncio
async def test_job_manager_enforces_concurrency_bounds() -> None:
    """Verifies that at most max_concurrent_ingestion_jobs execute at the same time."""
    settings = Settings(
        max_concurrent_ingestion_jobs=2,
        max_admitted_ingestion_jobs=5,
    )
    mock_worker = _MockWorkerService(delay=0.05)
    manager = IngestionJobManager(worker_factory=lambda: mock_worker, settings=settings)

    # Submit 4 jobs
    for i in range(4):
        job_id = f"job-{i}"
        manifest = _manifest(f"repo-{i}")
        manager.reserve_admission(manifest.repository_id, job_id)
        manager.submit_job(manifest, job_id)

    # Await all active tasks
    while manager.active_job_count > 0:
        await asyncio.sleep(0.01)

    assert len(mock_worker.completed_calls) == 4
    # Max concurrency observed must not exceed configured limit of 2
    assert mock_worker.max_concurrent_seen <= 2


@pytest.mark.asyncio
async def test_job_manager_rejects_admission_when_capacity_exceeded() -> None:
    """Verifies that exceeding max_admitted_ingestion_jobs raises QueueError."""
    settings = Settings(
        max_concurrent_ingestion_jobs=1,
        max_admitted_ingestion_jobs=2,
    )
    mock_worker = _MockWorkerService(delay=0.1)
    manager = IngestionJobManager(worker_factory=lambda: mock_worker, settings=settings)

    # Admitting 2 jobs should succeed
    manager.reserve_admission("repo-1", "job-1")
    manager.reserve_admission("repo-2", "job-2")

    # 3rd job must be rejected with QueueError
    with pytest.raises(QueueError) as exc_info:
        manager.reserve_admission("repo-3", "job-3")

    assert "Maximum background ingestion capacity reached" in str(exc_info.value)
    assert exc_info.value.http_status in (503, 429)

    # Releasing one allows admission again
    manager.release_admission("job-1")
    manager.reserve_admission("repo-3", "job-3")


@pytest.mark.asyncio
async def test_job_manager_shutdown_cancels_pending_and_rejects_new_work() -> None:
    """Verifies graceful shutdown: rejects new submissions and cancels tasks exceeding grace."""
    settings = Settings(
        max_concurrent_ingestion_jobs=2,
        max_admitted_ingestion_jobs=5,
        ingestion_job_grace_period_seconds=0.5,
    )
    # Long running worker (1 second)
    mock_worker = _MockWorkerService(delay=1.0)
    manager = IngestionJobManager(worker_factory=lambda: mock_worker, settings=settings)

    manager.reserve_admission("repo-1", "job-1")
    manager.submit_job(_manifest("repo-1"), "job-1")

    assert manager.is_accepting is True
    assert manager.active_job_count == 1

    # Initiate shutdown
    await manager.shutdown(timeout=0.05)

    assert manager.is_accepting is False
    assert manager.active_job_count == 0

    # New work must be rejected
    with pytest.raises(QueueError) as exc:
        manager.reserve_admission("repo-2", "job-2")
    assert "shutting down" in str(exc.value)


@pytest.mark.asyncio
async def test_job_manager_retrieves_exceptions_without_crashing() -> None:
    """Verifies that task failures are retrieved and handled cleanly by the done callback."""
    settings = Settings()
    mock_worker = _MockWorkerService(delay=0.01, fail=True)
    manager = IngestionJobManager(worker_factory=lambda: mock_worker, settings=settings)

    manager.reserve_admission("repo-fail", "job-fail")
    manager.submit_job(_manifest("repo-fail"), "job-fail")

    while manager.active_job_count > 0:
        await asyncio.sleep(0.01)

    assert len(mock_worker.completed_calls) == 1
    assert manager.active_job_count == 0
    assert manager.admitted_job_count == 0


async def test_recovery_uses_idle_cadence_and_flushes_only_via_reconciliation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = IngestionJobManager(worker_factory=lambda: None, settings=Settings())
    processing = AsyncMock()
    intervals: list[float] = []

    async def sleep_tick(interval: float) -> None:
        intervals.append(interval)
        if len(intervals) == 1:
            manager.reserve_admission("fixture-repo", "fixture-job")
        else:
            manager._shutting_down = True

    monkeypatch.setattr(asyncio, "sleep", sleep_tick)
    await manager._run_recovery_loop(processing)
    assert intervals == [120.0, 30.0]
    processing.reconcile_interrupted_jobs.assert_awaited_once()
    processing.flush_pending_callbacks.assert_not_awaited()
