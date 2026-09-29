"""Unit tests for app/services/repository_processing_service.py (Task 30, Task T5).

Verifies submission orchestration, persistence-before-execution, attempt fencing,
and interrupted-job recovery using IngestionJobManager and Redis.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.config.settings import Settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError
from app.domain.models import ManifestFile, ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.services.repository_processing_service import (
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


class _MockJobManager:
    def __init__(self, *, fail_reserve: bool = False, fail_submit: bool = False) -> None:
        self.fail_reserve = fail_reserve
        self.fail_submit = fail_submit
        self.submitted_jobs: list[tuple[RepositoryManifest, str]] = []
        self.reserved_jobs: list[tuple[str, str]] = []
        self.released_jobs: list[str] = []

    def reserve_admission(self, repository_id: str, job_id: str) -> None:
        if self.fail_reserve:
            raise QueueError("capacity exceeded")
        self.reserved_jobs.append((repository_id, job_id))

    def release_admission(self, job_id: str) -> None:
        self.released_jobs.append(job_id)

    def submit_job(self, manifest: RepositoryManifest, job_id: str) -> None:
        if self.fail_submit:
            raise QueueError("dispatch failed")
        self.submitted_jobs.append((manifest, job_id))


class _MockRawRedisClient:
    def __init__(self, active_set: set[str]) -> None:
        self.active_set = active_set

    async def sadd(self, key: str, member: str) -> int:
        self.active_set.add(member)
        return 1

    async def srem(self, key: str, member: str) -> int:
        self.active_set.discard(member)
        return 1

    async def smembers(self, key: str) -> set[str]:
        return set(self.active_set)


class Harness:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.locks_held: set[str] = set()
        self.active_set: set[str] = set()
        self.deny_lock = False

        self.cache = RedisClient(settings=Settings())
        self.job_manager = _MockJobManager()
        self.raw_redis = _MockRawRedisClient(self.active_set)

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> RepositoryProcessingService:
        async def _get_cache(key: str) -> str | None:
            return self.store.get(key)

        async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
            self.store[key] = value

        async def _delete_cache(key: str) -> None:
            self.store.pop(key, None)

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

        async def _eval_atomic_status_transition(
            status_key: str,
            active_set_key: str,
            expected_job_id: str | None,
            new_record_json: str,
            ttl_seconds: int,
            is_terminal: bool,
            repository_id: str,
            mode: str = "transition",
            expected_heartbeat_at: str | None = None,
            pending_callback_payload: str | None = None,
        ) -> tuple[bool, str]:
            current = self.store.get(status_key)
            if current:
                import json
                cur_obj = json.loads(current)
                cur_job_id = cur_obj.get("job_id")
                cur_status = cur_obj.get("status")
                if expected_job_id and cur_job_id and cur_job_id != expected_job_id:
                    return (False, "stale_attempt_mismatch")
                if mode == "heartbeat" and cur_status in ("ready", "failed"):
                    return (False, "already_terminal")
                if mode == "reconcile" and cur_status not in ("pending", "queued", "processing"):
                    return (False, "not_in_flight")

            self.store[status_key] = new_record_json
            if is_terminal:
                self.active_set.discard(repository_id)
                if pending_callback_payload:
                    self.store[f"seis:pending-callback:{repository_id}"] = pending_callback_payload
            else:
                self.active_set.add(repository_id)
            return (True, "ok")

        async def _eval_atomic_delete_attempt(
            status_key: str,
            active_set_key: str,
            expected_job_id: str | None,
            repository_id: str,
        ) -> tuple[bool, str]:
            current = self.store.get(status_key)
            if current:
                import json
                cur_obj = json.loads(current)
                cur_job_id = cur_obj.get("job_id")
                if expected_job_id and cur_job_id and cur_job_id != expected_job_id:
                    return (False, "stale_attempt_mismatch")
            self.store.pop(status_key, None)
            self.active_set.discard(repository_id)
            return (True, "ok")

        async def _sscan_members(
            key: str, cursor: int = 0, count: int = 100
        ) -> tuple[int, list[str]]:
            return (0, list(self.active_set))

        async def _record_pending_callback(
            repository_id: str,
            payload_json: str,
            job_id: str | None = None,
            ttl_seconds: int = 86400,
        ) -> None:
            self.store[f"seis:pending-callback:{repository_id}"] = payload_json

        async def _acknowledge_pending_callback(
            repository_id: str, job_id: str | None = None
        ) -> None:
            self.store.pop(f"seis:pending-callback:{repository_id}", None)

        async def _get_pending_callback(
            repository_id: str, job_id: str | None = None
        ) -> str | None:
            return self.store.get(f"seis:pending-callback:{repository_id}")

        monkeypatch.setattr(self.cache, "get_cache", _get_cache)
        monkeypatch.setattr(self.cache, "set_cache", _set_cache)
        monkeypatch.setattr(self.cache, "delete_cache", _delete_cache)
        monkeypatch.setattr(self.cache, "acquire_lock", _acquire_lock)
        monkeypatch.setattr(
            self.cache, "eval_atomic_status_transition", _eval_atomic_status_transition
        )
        monkeypatch.setattr(self.cache, "eval_atomic_delete_attempt", _eval_atomic_delete_attempt)
        monkeypatch.setattr(self.cache, "sscan_members", _sscan_members)
        monkeypatch.setattr(self.cache, "record_pending_callback", _record_pending_callback)
        monkeypatch.setattr(
            self.cache, "acknowledge_pending_callback", _acknowledge_pending_callback
        )
        monkeypatch.setattr(self.cache, "get_pending_callback", _get_pending_callback)
        monkeypatch.setattr(self.cache, "_get_client", lambda: self.raw_redis)

        return RepositoryProcessingService(
            cache_client=self.cache,
            job_manager=self.job_manager,  # type: ignore[arg-type]
            settings=Settings(ingestion_heartbeat_timeout_seconds=90),
        )

    def seed_status(
        self,
        repository_id: str,
        status: ProcessingStatus,
        *,
        heartbeat_ago_seconds: float = 0,
        job_id: str = "prev-job-1",
    ) -> None:
        now = datetime.now(UTC)
        record = ProcessingStatusRecord(
            repository_id=repository_id,
            job_id=job_id,
            status=status,
            stage=None,
            commit_sha="prior-sha",
            started_at=now,
            updated_at=now,
            heartbeat_at=now - timedelta(seconds=heartbeat_ago_seconds),
        )
        self.store[f"{_STATUS_KEY_PREFIX}{repository_id}"] = record.model_dump_json()
        if status in (ProcessingStatus.PENDING, ProcessingStatus.PROCESSING):
            self.active_set.add(repository_id)


# ---------------------------------------------------------------------------
# submit_ingestion_job
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_submit_ingestion_job_returns_pending_result_and_dispatches_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    result = await service.submit_ingestion_job(_manifest("repo-1"))

    assert result.repository_id == "repo-1"
    assert result.status is ProcessingStatus.PENDING
    assert result.job_id.startswith("job_")

    assert len(harness.job_manager.submitted_jobs) == 1
    manifest, job_id = harness.job_manager.submitted_jobs[0]
    assert manifest.repository_id == "repo-1"
    assert job_id == result.job_id


@pytest.mark.asyncio
async def test_submit_ingestion_job_persists_pending_status_before_execution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    result = await service.submit_ingestion_job(_manifest("repo-1"))

    stored = harness.store[f"{_STATUS_KEY_PREFIX}repo-1"]
    record = ProcessingStatusRecord.model_validate_json(stored)
    assert record.status is ProcessingStatus.PENDING
    assert record.job_id == result.job_id
    assert record.heartbeat_at is not None
    assert record.file_count == 1
    assert "repo-1" in harness.active_set


@pytest.mark.asyncio
async def test_submit_ingestion_job_rejects_when_lock_already_held(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.deny_lock = True
    service = harness.wire(monkeypatch)

    with pytest.raises(BusinessError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    assert harness.job_manager.submitted_jobs == []
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
@pytest.mark.asyncio
async def test_submit_ingestion_job_rejects_when_active_status_is_fresh(
    monkeypatch: pytest.MonkeyPatch, in_flight_status: ProcessingStatus
) -> None:
    harness = Harness()
    # Fresh heartbeat 10s ago
    harness.seed_status("repo-1", in_flight_status, heartbeat_ago_seconds=10)
    service = harness.wire(monkeypatch)

    with pytest.raises(BusinessError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    assert harness.job_manager.submitted_jobs == []


@pytest.mark.asyncio
async def test_submit_ingestion_job_recovers_stale_attempt_and_allows_resubmission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    # Stale heartbeat (120s ago > 90s timeout)
    harness.seed_status("repo-1", ProcessingStatus.PROCESSING, heartbeat_ago_seconds=120)
    service = harness.wire(monkeypatch)

    result = await service.submit_ingestion_job(_manifest("repo-1"))

    assert result.status is ProcessingStatus.PENDING
    assert len(harness.job_manager.submitted_jobs) == 1
    stored = harness.store[f"{_STATUS_KEY_PREFIX}repo-1"]
    record = ProcessingStatusRecord.model_validate_json(stored)
    assert record.job_id == result.job_id


@pytest.mark.asyncio
async def test_submit_ingestion_job_cleans_up_on_dispatch_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.job_manager.fail_submit = True
    service = harness.wire(monkeypatch)

    with pytest.raises(QueueError):
        await service.submit_ingestion_job(_manifest("repo-1"))

    # Status record should be cleaned up on scheduling failure
    assert f"{_STATUS_KEY_PREFIX}repo-1" not in harness.store
    assert len(harness.job_manager.released_jobs) == 1


@pytest.mark.asyncio
async def test_reconcile_interrupted_jobs_discovers_orphans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    harness.seed_status("repo-stuck", ProcessingStatus.PROCESSING, heartbeat_ago_seconds=200)
    service = harness.wire(monkeypatch)

    reconciled = await service.reconcile_interrupted_jobs()

    assert reconciled == 1
    stored = harness.store[f"{_STATUS_KEY_PREFIX}repo-stuck"]
    record = ProcessingStatusRecord.model_validate_json(stored)
    assert record.status is ProcessingStatus.FAILED
    assert "interrupted" in record.error
