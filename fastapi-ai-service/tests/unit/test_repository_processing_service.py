"""Unit tests for app/services/repository_processing_service.py (Task 30).

Uses real `RedisClient`/`Celery` instances whose relevant methods are
monkeypatched -- the same pattern already used in
tests/unit/test_evolution_indexer.py, avoiding duck-typed fakes that
would fail the constructor's real type hints.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import pytest

from app.config.settings import Settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError, RepositoryNotFoundError
from app.domain.models import ManifestFile, ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.infra.queue.task_queue import build_celery_app
from app.services.repository_processing_service import (
    _INGESTION_QUEUE_NAME,
    _INGESTION_TASK_NAME,
    _STATUS_KEY_PREFIX,
    RepositoryProcessingService,
)


def _manifest(repository_id: str = "repo-1") -> RepositoryManifest:
    return RepositoryManifest(
        repository_id=repository_id,
        workspace_id="ws-1",
        commit_sha="abc123",
        files=[ManifestFile(path="a.py", content=b"print(1)", language="python", size_bytes=9)],
    )


class _FakeAsyncResult:
    def __init__(self, task_id: str) -> None:
        self.id = task_id


class Harness:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.locks_held: set[str] = set()
        self.send_task_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self.next_task_id = "task-123"
        self.fail_send_task = False
        self.deny_lock = False

        self.cache = RedisClient(settings=Settings())
        self.queue = build_celery_app(Settings())

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> RepositoryProcessingService:
        async def _get_cache(key: str) -> str | None:
            return self.store.get(key)

        async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
            self.store[key] = value

        @asynccontextmanager
        async def _acquire_lock(lock_name: str, timeout: int) -> Any:
            if self.deny_lock or lock_name in self.locks_held:
                yield False
                return
            self.locks_held.add(lock_name)
            try:
                yield True
            finally:
                self.locks_held.discard(lock_name)

        def _send_task(
            name: str,
            args: tuple[Any, ...] | None = None,
            queue: str | None = None,
            **kwargs: Any,
        ) -> _FakeAsyncResult:
            self.send_task_calls.append((name, tuple(args or ()), {"queue": queue}))
            if self.fail_send_task:
                raise RuntimeError("broker unreachable")
            return _FakeAsyncResult(self.next_task_id)

        monkeypatch.setattr(self.cache, "get_cache", _get_cache)
        monkeypatch.setattr(self.cache, "set_cache", _set_cache)
        monkeypatch.setattr(self.cache, "acquire_lock", _acquire_lock)
        monkeypatch.setattr(self.queue, "send_task", _send_task)

        return RepositoryProcessingService(
            cache_client=self.cache, task_queue=self.queue, settings=Settings()
        )

    def seed_status(self, repository_id: str, status: ProcessingStatus) -> None:
        from datetime import UTC, datetime

        record = ProcessingStatusRecord(
            repository_id=repository_id,
            status=status,
            stage=None,
            commit_sha="prior-sha",
            started_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.store[f"{_STATUS_KEY_PREFIX}{repository_id}"] = record.model_dump_json()


# ---------------------------------------------------------------------------
# submit_ingestion_job
# ---------------------------------------------------------------------------
async def test_submit_ingestion_job_returns_pending_result_and_dispatches_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    result = await service.submit_ingestion_job(_manifest("repo-1"))

    assert result.repository_id == "repo-1"
    assert result.job_id == "task-123"
    assert result.status is ProcessingStatus.PENDING

    assert len(harness.send_task_calls) == 1
    name, args, kwargs = harness.send_task_calls[0]
    assert name == _INGESTION_TASK_NAME
    assert kwargs["queue"] == _INGESTION_QUEUE_NAME
    assert args[0]["repository_id"] == "repo-1"


async def test_submit_ingestion_job_persists_pending_status_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    await service.submit_ingestion_job(_manifest("repo-1"))

    stored = harness.store[f"{_STATUS_KEY_PREFIX}repo-1"]
    record = ProcessingStatusRecord.model_validate_json(stored)
    assert record.status is ProcessingStatus.PENDING
    assert record.file_count == 1
    assert record.chunk_count is None


async def test_submit_ingestion_job_rejects_when_lock_already_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.deny_lock = True
    service = harness.wire(monkeypatch)

    with pytest.raises(BusinessError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    assert harness.send_task_calls == []
    assert harness.store == {}


@pytest.mark.parametrize(
    "in_flight_status",
    [
        ProcessingStatus.PENDING,
        ProcessingStatus.QUEUED,
        ProcessingStatus.PROCESSING,
        ProcessingStatus.UPDATING,
    ],
)
async def test_submit_ingestion_job_rejects_when_status_already_in_flight(
    monkeypatch: pytest.MonkeyPatch, in_flight_status: ProcessingStatus
) -> None:
    harness = Harness()
    harness.seed_status("repo-1", in_flight_status)
    service = harness.wire(monkeypatch)

    with pytest.raises(BusinessError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    assert harness.send_task_calls == []


@pytest.mark.parametrize(
    "terminal_status",
    [
        ProcessingStatus.READY,
        ProcessingStatus.FAILED,
        ProcessingStatus.ARCHIVED,
        ProcessingStatus.DELETED,
        ProcessingStatus.RECOVERY,
        ProcessingStatus.ROLLBACK,
    ],
)
async def test_submit_ingestion_job_allows_resubmission_from_terminal_status(
    monkeypatch: pytest.MonkeyPatch, terminal_status: ProcessingStatus
) -> None:
    harness = Harness()
    harness.seed_status("repo-1", terminal_status)
    service = harness.wire(monkeypatch)

    result = await service.submit_ingestion_job(_manifest("repo-1"))

    assert result.status is ProcessingStatus.PENDING
    assert len(harness.send_task_calls) == 1


async def test_submit_ingestion_job_raises_queue_error_on_dispatch_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.fail_send_task = True
    service = harness.wire(monkeypatch)

    with pytest.raises(QueueError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    # No status record should be written for a job that was never
    # actually enqueued.
    assert harness.store == {}


async def test_submit_ingestion_job_releases_lock_after_completion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    await service.submit_ingestion_job(_manifest("repo-1"))

    assert harness.locks_held == set()


# ---------------------------------------------------------------------------
# get_processing_status
# ---------------------------------------------------------------------------
async def test_get_processing_status_returns_stored_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.seed_status("repo-1", ProcessingStatus.PROCESSING)
    service = harness.wire(monkeypatch)

    record = await service.get_processing_status("repo-1")

    assert record.repository_id == "repo-1"
    assert record.status is ProcessingStatus.PROCESSING


async def test_get_processing_status_raises_not_found_when_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    with pytest.raises(RepositoryNotFoundError):
        await service.get_processing_status("never-submitted")
