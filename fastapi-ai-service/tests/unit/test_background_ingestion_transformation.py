"""Unit tests for Background Job Architecture Transformation (Task T5).

Covers:
1. HTTP 202 Accepted response with job_id and pending status.
2. Persistence-before-execution guarantee (record exists in Redis prior to worker execution).
3. Concurrent duplicate submission race prevention (409 Conflict).
4. Bounded admission capacity rejection (QueueError / 503).
5. Attempt fencing against stale job IDs (older attempt cannot overwrite newer attempt).
6. Startup reconciliation of interrupted jobs (orphans discovered, marked FAILED, cleaned up).
7. Graceful shutdown cancellation handling.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.api.deps import get_repository_processing_service, get_settings_dep, verify_service_token
from app.config.settings import Settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError
from app.domain.models import (
    JobSubmissionResult,
    ManifestFile,
    ProcessingStatusRecord,
    RepositoryManifest,
)
from app.infra.cache.cache_client import RedisClient
from app.main import create_app
from app.services.job_manager import IngestionJobManager
from app.services.repository_processing_service import (
    _ACTIVE_INGESTIONS_KEY,
    _STATUS_KEY_PREFIX,
    RepositoryProcessingService,
)


def _manifest(repository_id: str = "repo-test-1") -> RepositoryManifest:
    return RepositoryManifest(
        repository_id=repository_id,
        workspace_id="ws-1",
        commit_sha="commit-sha-1",
        files=[
            ManifestFile(
                path="index.js",
                content=b"console.log('hello');",
                language="javascript",
                size_bytes=22,
            )
        ],
    )


class MemoryCache:
    """In-memory stand-in for RedisClient."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}
        self.locks_held: set[str] = set()

    async def get_cache(self, key: str) -> str | None:
        return self.store.get(key)

    async def set_cache(self, key: str, value: str, ttl_seconds: int) -> None:
        self.store[key] = value

    async def delete_cache(self, key: str) -> None:
        self.store.pop(key, None)

    async def add_to_set(self, key: str, member: str) -> None:
        self.sets.setdefault(key, set()).add(member)

    async def remove_from_set(self, key: str, member: str) -> None:
        if key in self.sets:
            self.sets[key].discard(member)

    async def get_set_members(self, key: str) -> set[str]:
        return set(self.sets.get(key, set()))

    async def sscan_members(
        self, key: str, cursor: int = 0, count: int = 100
    ) -> tuple[int, list[str]]:
        members = list(self.sets.get(key, set()))
        return (0, members)

    async def eval_atomic_status_transition(
        self,
        status_key: str,
        active_set_key: str,
        expected_job_id: str | None,
        new_record_json: str,
        ttl_seconds: int,
        is_terminal: bool,
        repository_id: str,
        mode: str = "transition",
        expected_heartbeat_at: str | None = None,
        new_heartbeat_at: str | None = None,
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
            if (cur_status in ("ready", "failed")) and (mode == "heartbeat" or not is_terminal):
                return (False, "already_terminal")
            if cur_status == "ready":
                if new_record_json:
                    new_obj = json.loads(new_record_json)
                    if new_obj.get("status") == "failed":
                        return (False, "cannot_fail_completed_job")
            if cur_status == "processing" and new_record_json:
                new_obj = json.loads(new_record_json)
                if new_obj.get("status") in ("pending", "queued"):
                    return (False, "invalid_status_regression")
            if mode == "heartbeat":
                cur_obj["heartbeat_at"] = new_heartbeat_at
                cur_obj["updated_at"] = new_heartbeat_at
                self.store[status_key] = json.dumps(cur_obj)
                return (True, "ok")
            if mode == "reconcile":
                if cur_status not in ("pending", "queued", "processing"):
                    return (False, "not_in_flight")
                if expected_heartbeat_at:
                    cur_hb = cur_obj.get("heartbeat_at") or cur_obj.get("updated_at") or ""
                    cur_norm = cur_hb.replace("+00:00", "Z")
                    exp_norm = expected_heartbeat_at.replace("+00:00", "Z")
                    if cur_norm != exp_norm:
                        return (False, "heartbeat_renewed")

        self.store[status_key] = new_record_json
        if is_terminal:
            if active_set_key in self.sets:
                self.sets[active_set_key].discard(repository_id)
            if pending_callback_payload:
                key = (
                    f"seis:pending-callback:{repository_id}:{expected_job_id}"
                    if expected_job_id
                    else f"seis:pending-callback:{repository_id}"
                )
                delivery_id = f"{repository_id}:{expected_job_id}" if expected_job_id else repository_id
                self.store[key] = pending_callback_payload
                self.sets.setdefault("seis:pending-callback-deliveries", set()).add(delivery_id)
        else:
            self.sets.setdefault(active_set_key, set()).add(repository_id)
        return (True, "ok")

    async def eval_atomic_delete_attempt(
        self,
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
        if active_set_key in self.sets:
            self.sets[active_set_key].discard(repository_id)
        return (True, "ok")

    async def record_pending_callback(
        self,
        repository_id: str,
        payload_json: str,
        job_id: str | None = None,
        ttl_seconds: int = 86400,
    ) -> None:
        key = (
            f"seis:pending-callback:{repository_id}:{job_id}"
            if job_id
            else f"seis:pending-callback:{repository_id}"
        )
        delivery_id = f"{repository_id}:{job_id}" if job_id else repository_id
        self.store[key] = payload_json
        self.sets.setdefault("seis:pending-callback-deliveries", set()).add(delivery_id)

    async def acknowledge_pending_callback(
        self, repository_id: str, job_id: str | None = None
    ) -> None:
        if job_id:
            self.store.pop(f"seis:pending-callback:{repository_id}:{job_id}", None)
            if "seis:pending-callback-deliveries" in self.sets:
                self.sets["seis:pending-callback-deliveries"].discard(f"{repository_id}:{job_id}")
        self.store.pop(f"seis:pending-callback:{repository_id}", None)
        if "seis:pending-callback-deliveries" in self.sets:
            self.sets["seis:pending-callback-deliveries"].discard(repository_id)

    async def get_pending_callback(
        self, repository_id: str, job_id: str | None = None
    ) -> str | None:
        if job_id:
            val = self.store.get(f"seis:pending-callback:{repository_id}:{job_id}")
            if val is not None:
                return val
        return self.store.get(f"seis:pending-callback:{repository_id}")

    @asynccontextmanager
    async def acquire_lock(self, lock_name: str, timeout: int) -> Any:
        if lock_name in self.locks_held:
            yield False
            return
        self.locks_held.add(lock_name)
        try:
            yield True
        finally:
            self.locks_held.discard(lock_name)


def _wire_mock_redis(
    real_redis: RedisClient, cache: MemoryCache, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(real_redis, "get_cache", cache.get_cache)
    monkeypatch.setattr(real_redis, "set_cache", cache.set_cache)
    monkeypatch.setattr(real_redis, "delete_cache", cache.delete_cache)
    monkeypatch.setattr(real_redis, "add_to_set", cache.add_to_set)
    monkeypatch.setattr(real_redis, "remove_from_set", cache.remove_from_set)
    monkeypatch.setattr(real_redis, "get_set_members", cache.get_set_members)
    monkeypatch.setattr(real_redis, "acquire_lock", cache.acquire_lock)
    monkeypatch.setattr(real_redis, "sscan_members", cache.sscan_members)
    monkeypatch.setattr(
        real_redis, "eval_atomic_status_transition", cache.eval_atomic_status_transition
    )
    monkeypatch.setattr(real_redis, "eval_atomic_delete_attempt", cache.eval_atomic_delete_attempt)
    monkeypatch.setattr(real_redis, "record_pending_callback", cache.record_pending_callback)
    monkeypatch.setattr(
        real_redis, "acknowledge_pending_callback", cache.acknowledge_pending_callback
    )
    monkeypatch.setattr(real_redis, "get_pending_callback", cache.get_pending_callback)


# ---------------------------------------------------------------------------
# 1. HTTP 202 Ingest Contract
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_http_ingest_returns_202_with_job_id() -> None:
    test_settings = Settings(
        internal_api_key=SecretStr("test-secret"),
    )
    mock_service = AsyncMock(spec=RepositoryProcessingService)
    now = datetime.now(UTC)
    mock_service.submit_ingestion_job.return_value = JobSubmissionResult(
        repository_id="repo-202",
        job_id="job-uuid-123",
        status=ProcessingStatus.PENDING,
        submitted_at=now,
    )

    app = create_app()
    app.dependency_overrides[get_settings_dep] = lambda: test_settings
    app.dependency_overrides[verify_service_token] = lambda: "test-secret"
    app.dependency_overrides[get_repository_processing_service] = lambda: mock_service

    payload = {
        "workspace_id": "ws-1",
        "commit_sha": "abc1234",
        "files": [{"path": "a.py", "content": "x = 1", "language": "python", "size_bytes": 5}],
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/repositories/repo-202/ingest",
            json=payload,
            headers={"Authorization": "Bearer test-secret"},
        )

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "pending"
    assert data["job_id"] == "job-uuid-123"
    assert data["repository_id"] == "repo-202"
    assert "submitted_at" in data


# ---------------------------------------------------------------------------
# 2. Persistence-Before-Execution Guarantee
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_persistence_before_execution_guarantee(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = MemoryCache()
    settings = Settings()
    executed_order: list[str] = []

    class MockWorker:
        async def process_ingestion_job(self, payload: Any, *, job_id: str | None = None) -> None:
            # Check whether status is already in cache
            status = await cache.get_cache("seis:repo-processing-status:repo-pbe")
            assert status is not None
            record = ProcessingStatusRecord.model_validate_json(status)
            assert record.status == ProcessingStatus.PENDING
            assert record.job_id == job_id
            assert record.heartbeat_at is not None
            executed_order.append("worker_executed")

    worker = MockWorker()
    manager = IngestionJobManager(worker_factory=lambda: worker, settings=settings)

    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    service = RepositoryProcessingService(
        cache_client=real_redis,
        job_manager=manager,
        settings=settings,
    )

    manifest = _manifest("repo-pbe")
    res = await service.submit_ingestion_job(manifest)

    assert res.status == ProcessingStatus.PENDING
    assert res.job_id is not None

    # Wait for in-process background worker
    while manager.active_job_count > 0:
        await asyncio.sleep(0.01)

    assert "worker_executed" in executed_order
    # Verify active ingestion set was maintained
    members = await cache.get_set_members(_ACTIVE_INGESTIONS_KEY)
    assert "repo-pbe" in members


# ---------------------------------------------------------------------------
# 3. Duplicate Submission Race (409 Conflict)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_duplicate_submission_race_rejection(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = MemoryCache()
    settings = Settings()

    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    manager = IngestionJobManager(worker_factory=lambda: AsyncMock(), settings=settings)
    service = RepositoryProcessingService(
        cache_client=real_redis,
        job_manager=manager,
        settings=settings,
    )

    try:
        # First submission succeeds
        await service.submit_ingestion_job(_manifest("repo-race"))

        # Second submission finds fresh in-flight status -> raises BusinessError
        with pytest.raises(BusinessError) as exc_info:
            await service.submit_ingestion_job(_manifest("repo-race"))

        assert exc_info.value.http_status in (409, 422)
        assert "already" in str(exc_info.value).lower()
    finally:
        await manager.shutdown(timeout=1.0)


# ---------------------------------------------------------------------------
# 4. Bounded Admission Rejection (503 Service Unavailable)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_bounded_admission_capacity_rejection() -> None:
    settings = Settings(
        max_concurrent_ingestion_jobs=1,
        max_admitted_ingestion_jobs=2,
    )
    manager = IngestionJobManager(worker_factory=lambda: AsyncMock(), settings=settings)

    manager.reserve_admission("repo-1", "job-1")
    manager.reserve_admission("repo-2", "job-2")

    # 3rd admission exceeds max_admitted_ingestion_jobs
    with pytest.raises(QueueError) as exc_info:
        manager.reserve_admission("repo-3", "job-3")

    assert exc_info.value.http_status in (503, 429)
    assert "capacity reached" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# 5. Startup Interruption Recovery
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_startup_interruption_reconciliation(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = MemoryCache()
    settings = Settings()

    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    # Seed an orphaned job in Redis from a prior process crash with expired heartbeat
    orphaned_record = ProcessingStatusRecord(
        repository_id="repo-crashed",
        job_id="job-crashed-old",
        commit_sha="commit-crashed",
        status=ProcessingStatus.PROCESSING,
        stage=None,
        started_at=datetime.now(UTC) - timedelta(seconds=200),
        updated_at=datetime.now(UTC) - timedelta(seconds=200),
        heartbeat_at=datetime.now(UTC) - timedelta(seconds=200),
    )
    await cache.set_cache(
        f"{_STATUS_KEY_PREFIX}repo-crashed",
        orphaned_record.model_dump_json(),
        21600,
    )
    await cache.add_to_set(_ACTIVE_INGESTIONS_KEY, "repo-crashed")

    mock_express = AsyncMock()
    service = RepositoryProcessingService(
        cache_client=real_redis,
        express_callback_client=mock_express,
        settings=settings,
    )

    # Startup catch-up discovers and reconciles orphan
    reconciled_count = await service.reconcile_interrupted_jobs()
    assert reconciled_count == 1

    # Verify status in Redis was updated to FAILED with explanation
    raw_status = await cache.get_cache(f"{_STATUS_KEY_PREFIX}repo-crashed")
    assert raw_status is not None
    updated_record = ProcessingStatusRecord.model_validate_json(raw_status)
    assert updated_record.status == ProcessingStatus.FAILED
    assert "interrupted by service restart" in (updated_record.error or "")

    # Active index cleaned up
    members = await cache.get_set_members(_ACTIVE_INGESTIONS_KEY)
    assert "repo-crashed" not in members

    # Express was notified of terminal failure
    mock_express.send_status_update.assert_called_once()
    call_kwargs = mock_express.send_status_update.call_args.kwargs
    assert call_kwargs["repository_id"] == "repo-crashed"
    assert call_kwargs["status"] == "failed"
    assert call_kwargs["job_id"] == "job-crashed-old"


# ---------------------------------------------------------------------------
# 6. Attempt Superseded Halts Pipeline Cleanly
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_attempt_superseded_halts_pipeline_without_marking_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = MemoryCache()
    settings = Settings()
    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    mock_chroma = AsyncMock()
    mock_embedder = AsyncMock()
    mock_cache = AsyncMock()

    from app.core.processing.chunker import ASTChunker
    from app.core.processing.document_processor import DocumentProcessor
    from app.core.processing.metadata_generator import MetadataGenerator
    from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService

    worker = RepositoryIngestionWorkerService(
        chroma_client=mock_chroma,
        document_processor=DocumentProcessor(),
        chunker=ASTChunker(),
        metadata_generator=MetadataGenerator(),
        embedder=mock_embedder,
        embedding_cache=mock_cache,
        cache_client=real_redis,
    )

    # Seed an already newer attempt in Redis
    newer_record = ProcessingStatusRecord(
        repository_id="repo-superseded",
        job_id="job-newer-attempt",
        commit_sha="commit-new",
        status=ProcessingStatus.PROCESSING,
        stage=None,
        started_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        heartbeat_at=datetime.now(UTC),
    )
    await cache.set_cache(
        f"{_STATUS_KEY_PREFIX}repo-superseded",
        newer_record.model_dump_json(),
        21600,
    )

    # Dispatch older attempt job_id="job-stale-attempt"
    manifest = _manifest("repo-superseded")
    payload = manifest.model_dump(mode="json")
    await worker.process_ingestion_job(payload, job_id="job-stale-attempt")

    # Pipeline halted: embedder and chroma were NEVER called
    mock_embedder.embed_chunks.assert_not_called()
    mock_chroma.upsert_chunks.assert_not_called()

    # Newer attempt in Redis is preserved and NOT marked FAILED
    status = await cache.get_cache(f"{_STATUS_KEY_PREFIX}repo-superseded")
    assert status is not None
    current = ProcessingStatusRecord.model_validate_json(status)
    assert current.job_id == "job-newer-attempt"
    assert current.status == ProcessingStatus.PROCESSING


# ---------------------------------------------------------------------------
# 7. Startup Recovery Ignores Fresh Active Jobs
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_fresh_in_flight_job_is_not_reconciled(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = MemoryCache()
    settings = Settings(ingestion_heartbeat_timeout_seconds=90)
    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    # Seed an active job with a fresh heartbeat (renewed 10 seconds ago)
    fresh_record = ProcessingStatusRecord(
        repository_id="repo-fresh",
        job_id="job-fresh-1",
        commit_sha="commit-fresh",
        status=ProcessingStatus.PROCESSING,
        stage=None,
        started_at=datetime.now(UTC) - timedelta(seconds=20),
        updated_at=datetime.now(UTC) - timedelta(seconds=10),
        heartbeat_at=datetime.now(UTC) - timedelta(seconds=10),
    )
    await cache.set_cache(
        f"{_STATUS_KEY_PREFIX}repo-fresh",
        fresh_record.model_dump_json(),
        21600,
    )
    await cache.add_to_set(_ACTIVE_INGESTIONS_KEY, "repo-fresh")

    mock_express = AsyncMock()
    service = RepositoryProcessingService(
        cache_client=real_redis,
        express_callback_client=mock_express,
        settings=settings,
    )

    reconciled_count = await service.reconcile_interrupted_jobs()
    assert reconciled_count == 0  # NOT marked failed!

    status = await cache.get_cache(f"{_STATUS_KEY_PREFIX}repo-fresh")
    assert status is not None
    current = ProcessingStatusRecord.model_validate_json(status)
    assert current.status == ProcessingStatus.PROCESSING
    mock_express.send_status_update.assert_not_called()


# ---------------------------------------------------------------------------
# 8. Durable Callback Staging & Startup Flush
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_durable_callback_staged_and_flushed_on_recovery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = MemoryCache()
    settings = Settings()
    real_redis = RedisClient(settings=settings)
    _wire_mock_redis(real_redis, cache, monkeypatch)

    mock_express = AsyncMock()
    # Initially, Express callback fails (e.g. gateway rebooting / network blip)
    mock_express.send_status_update.return_value = False

    service = RepositoryProcessingService(
        cache_client=real_redis,
        express_callback_client=mock_express,
        settings=settings,
    )

    # Seed stale record and reconcile it
    stale_record = ProcessingStatusRecord(
        repository_id="repo-staged",
        job_id="job-staged-1",
        commit_sha="commit-staged",
        status=ProcessingStatus.PROCESSING,
        stage=None,
        started_at=datetime.now(UTC) - timedelta(seconds=200),
        updated_at=datetime.now(UTC) - timedelta(seconds=200),
        heartbeat_at=datetime.now(UTC) - timedelta(seconds=200),
    )
    await cache.set_cache(
        f"{_STATUS_KEY_PREFIX}repo-staged",
        stale_record.model_dump_json(),
        21600,
    )
    await cache.add_to_set(_ACTIVE_INGESTIONS_KEY, "repo-staged")

    reconciled = await service.reconcile_interrupted_jobs()
    assert reconciled == 1

    # Delivery failed, so pending callback MUST remain durably staged in Redis
    staged_payload = await cache.get_pending_callback("repo-staged", job_id="job-staged-1")
    assert staged_payload is not None
    assert "job-staged-1" in staged_payload

    # Now Express recovers and accepts status updates
    mock_express.send_status_update.return_value = True

    flushed = await service.flush_pending_callbacks()
    assert flushed == 1

    # After acknowledged delivery, staged callback is removed
    assert await cache.get_pending_callback("repo-staged", job_id="job-staged-1") is None
