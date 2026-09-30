"""Integration tests for interrupted ingestion recovery against live Redis (Task T5).

Requires a reachable Redis instance (e.g. localhost:6379 from docker-compose).
Tests:
1. Live Redis Lua execution of atomic transitions and attempt fencing.
2. Interrupted job recovery: stale in-flight jobs are marked FAILED and cleaned up.
3. Active in-flight jobs with fresh heartbeats are skipped and remain unharmed.
4. Durable callback staging and flush when gateway is temporarily unreachable.
5. Attempt supersession halts worker cleanly without marking the newer attempt failed.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest
import redis.asyncio as redis

from app.config.settings import Settings, get_settings
from app.domain.enums import ProcessingStatus
from app.domain.models import ManifestFile, ProcessingStatusRecord, RepositoryManifest
from app.infra.cache.cache_client import RedisClient
from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService
from app.services.repository_processing_service import (
    _ACTIVE_INGESTIONS_KEY,
    _STATUS_KEY_PREFIX,
    RepositoryProcessingService,
)


def _redis_is_reachable(url: str) -> bool:
    async def _check() -> bool:
        client = redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        try:
            return bool(await client.ping())
        except Exception:
            return False
        finally:
            await client.aclose()

    try:
        return asyncio.run(_check())
    except Exception:
        return False


_settings_for_skip_check = get_settings()
_REDIS_REACHABLE = _redis_is_reachable(_settings_for_skip_check.task_queue_broker_url)

pytestmark = pytest.mark.skipif(
    not _REDIS_REACHABLE,
    reason=f"No Redis server reachable at {_settings_for_skip_check.task_queue_broker_url!r}.",
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
async def live_redis(settings: Settings) -> Any:
    client = RedisClient(settings=settings)
    yield client
    await client.close()


def _manifest(repository_id: str) -> RepositoryManifest:
    return RepositoryManifest(
        repository_id=repository_id,
        workspace_id="ws-live-test",
        commit_sha="commit-sha-live-1",
        files=[
            ManifestFile(
                path="index.js",
                content=b"console.log('live recovery test');",
                language="javascript",
                size_bytes=32,
            )
        ],
    )


@pytest.mark.asyncio
async def test_live_redis_atomic_lua_status_transition(live_redis: RedisClient) -> None:
    repo_id = f"repo-lua-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    # 1. Initial pending write
    now = datetime.now(UTC)
    record1 = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-attempt-1",
        commit_sha="sha1",
        status=ProcessingStatus.PENDING,
        started_at=now,
        updated_at=now,
        heartbeat_at=now,
    )
    ok, reason = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id=None,
        new_record_json=record1.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=False,
        repository_id=repo_id,
        mode="transition",
    )
    assert ok is True
    assert reason == "ok"

    # Verify presence in Redis
    raw = await live_redis.get_cache(status_key)
    assert raw is not None
    assert "job-attempt-1" in raw
    members = await live_redis.get_set_members(active_set_key)
    assert repo_id in members

    # 2. Conflicting attempt from stale job ID should be REJECTED by Lua
    record_stale = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-attempt-0-stale",
        commit_sha="sha0",
        status=ProcessingStatus.FAILED,
        started_at=now,
        updated_at=now,
    )
    ok, reason = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-attempt-0-stale",
        new_record_json=record_stale.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=True,
        repository_id=repo_id,
        mode="transition",
    )
    assert ok is False
    assert reason == "stale_attempt_mismatch"

    # 3. Correct job ID transitions to terminal READY
    record_terminal = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-attempt-1",
        commit_sha="sha1",
        status=ProcessingStatus.READY,
        started_at=now,
        updated_at=datetime.now(UTC),
    )
    ok, reason = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-attempt-1",
        new_record_json=record_terminal.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=True,
        repository_id=repo_id,
        mode="transition",
    )
    assert ok is True
    assert reason == "ok"

    # Terminal state automatically removed repo from active set
    members = await live_redis.get_set_members(active_set_key)
    assert repo_id not in members

    # Clean up
    await live_redis.delete_cache(status_key)


@pytest.mark.asyncio
async def test_live_redis_interrupted_ingestion_recovery_lifecycle(
    live_redis: RedisClient, settings: Settings
) -> None:
    crashed_repo_id = f"repo-crashed-{uuid.uuid4().hex[:8]}"
    active_repo_id = f"repo-active-{uuid.uuid4().hex[:8]}"

    crashed_status_key = f"{_STATUS_KEY_PREFIX}{crashed_repo_id}"
    active_status_key = f"{_STATUS_KEY_PREFIX}{active_repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    now = datetime.now(UTC)

    # 1. Seed interrupted/crashed job with expired heartbeat (180s ago)
    crashed_record = ProcessingStatusRecord(
        repository_id=crashed_repo_id,
        job_id=f"job-crashed-{crashed_repo_id}",
        commit_sha="sha-crashed",
        status=ProcessingStatus.PROCESSING,
        started_at=now - timedelta(seconds=200),
        updated_at=now - timedelta(seconds=180),
        heartbeat_at=now - timedelta(seconds=180),
    )
    await live_redis.set_cache(
        crashed_status_key, crashed_record.model_dump_json(), ttl_seconds=3600
    )
    await live_redis.add_to_set(active_set_key, crashed_repo_id)

    # 2. Seed active healthy job with fresh heartbeat (5s ago)
    fresh_record = ProcessingStatusRecord(
        repository_id=active_repo_id,
        job_id=f"job-fresh-{active_repo_id}",
        commit_sha="sha-fresh",
        status=ProcessingStatus.PROCESSING,
        started_at=now - timedelta(seconds=30),
        updated_at=now - timedelta(seconds=5),
        heartbeat_at=now - timedelta(seconds=5),
    )
    await live_redis.set_cache(active_status_key, fresh_record.model_dump_json(), ttl_seconds=3600)
    await live_redis.add_to_set(active_set_key, active_repo_id)

    # 3. Run reconciliation via RepositoryProcessingService
    mock_express = AsyncMock()
    mock_express.send_status_update.return_value = True

    service = RepositoryProcessingService(
        cache_client=live_redis,
        express_callback_client=mock_express,
        settings=settings,
    )

    reconciled_count = await service.reconcile_interrupted_jobs()
    assert reconciled_count == 1

    # 4. Verify in live Redis that crashed job was reconciled to FAILED
    crashed_raw = await live_redis.get_cache(crashed_status_key)
    assert crashed_raw is not None
    updated_crashed = ProcessingStatusRecord.model_validate_json(crashed_raw)
    assert updated_crashed.status == ProcessingStatus.FAILED
    assert "interrupted by service restart" in (updated_crashed.error or "")

    # Active index no longer contains crashed job
    members = await live_redis.get_set_members(active_set_key)
    assert crashed_repo_id not in members

    # 5. Verify that fresh active job was NOT touched
    fresh_raw = await live_redis.get_cache(active_status_key)
    assert fresh_raw is not None
    updated_fresh = ProcessingStatusRecord.model_validate_json(fresh_raw)
    assert updated_fresh.status == ProcessingStatus.PROCESSING
    assert active_repo_id in members

    # 6. Verify Express callback was dispatched for the crashed job
    crashed_calls = [
        c for c in mock_express.send_status_update.call_args_list
        if c.kwargs.get("repository_id") == crashed_repo_id
    ]
    assert len(crashed_calls) == 1
    kwargs = crashed_calls[0].kwargs
    assert kwargs["repository_id"] == crashed_repo_id
    assert kwargs["status"] == "failed"
    assert kwargs["job_id"] == f"job-crashed-{crashed_repo_id}"

    # Clean up
    await live_redis.delete_cache(crashed_status_key)
    await live_redis.delete_cache(active_status_key)
    await live_redis.remove_from_set(active_set_key, active_repo_id)


@pytest.mark.asyncio
async def test_live_redis_durable_callback_staging_and_flush(
    live_redis: RedisClient, settings: Settings
) -> None:
    repo_id = f"repo-durable-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    now = datetime.now(UTC)
    stale_record = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-durable-123",
        commit_sha="sha-durable",
        status=ProcessingStatus.PROCESSING,
        started_at=now - timedelta(seconds=200),
        updated_at=now - timedelta(seconds=180),
        heartbeat_at=now - timedelta(seconds=180),
    )
    await live_redis.set_cache(status_key, stale_record.model_dump_json(), ttl_seconds=3600)
    await live_redis.add_to_set(active_set_key, repo_id)

    # 1. Gateway is down: send_status_update fails
    mock_express = AsyncMock()
    mock_express.send_status_update.return_value = False

    service = RepositoryProcessingService(
        cache_client=live_redis,
        express_callback_client=mock_express,
        settings=settings,
    )

    reconciled = await service.reconcile_interrupted_jobs()
    assert reconciled == 1

    # Verify callback is durably staged in live Redis
    staged = await live_redis.get_pending_callback(repo_id)
    assert staged is not None
    assert "job-durable-123" in staged
    assert "failed" in staged

    # 2. Gateway comes back online
    mock_express.send_status_update.return_value = True

    flushed = await service.flush_pending_callbacks()
    assert flushed == 1

    # Verified callback was removed from live Redis staging
    assert await live_redis.get_pending_callback(repo_id) is None

    # Clean up
    await live_redis.delete_cache(status_key)


@pytest.mark.asyncio
async def test_live_redis_attempt_supersession_halts_worker_cleanly(
    live_redis: RedisClient,
) -> None:
    repo_id = f"repo-halt-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"

    now = datetime.now(UTC)
    # Newer attempt already in live Redis
    newer_record = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-newer-attempt-999",
        commit_sha="sha-new",
        status=ProcessingStatus.PROCESSING,
        started_at=now,
        updated_at=now,
        heartbeat_at=now,
    )
    await live_redis.set_cache(status_key, newer_record.model_dump_json(), ttl_seconds=3600)

    # Mock Chroma and Embedder
    mock_chroma = AsyncMock()
    mock_embedder = AsyncMock()
    mock_cache = AsyncMock()

    from app.core.processing.chunker import ASTChunker
    from app.core.processing.document_processor import DocumentProcessor
    from app.core.processing.metadata_generator import MetadataGenerator

    worker = RepositoryIngestionWorkerService(
        chroma_client=mock_chroma,
        document_processor=DocumentProcessor(),
        chunker=ASTChunker(),
        metadata_generator=MetadataGenerator(),
        embedder=mock_embedder,
        embedding_cache=mock_cache,
        cache_client=live_redis,
    )

    # Dispatch stale attempt
    manifest = _manifest(repo_id)
    await worker.process_ingestion_job(
        manifest.model_dump(mode="json"),
        job_id="job-stale-attempt-001",
    )

    # Embedder and Chroma were NOT called
    mock_embedder.embed_chunks.assert_not_called()
    mock_chroma.upsert_chunks.assert_not_called()

    # The newer attempt in live Redis is completely intact
    current_raw = await live_redis.get_cache(status_key)
    assert current_raw is not None
    current = ProcessingStatusRecord.model_validate_json(current_raw)
    assert current.job_id == "job-newer-attempt-999"
    assert current.status == ProcessingStatus.PROCESSING

    # Clean up
    await live_redis.delete_cache(status_key)


@pytest.mark.asyncio
async def test_reconciliation_does_not_fail_freshly_renewed_job_in_redis(
    live_redis: RedisClient, settings: Settings
) -> None:
    """Proves: If a job renews its heartbeat after recovery observed a stale heartbeat,
    recovery is REJECTED by Lua, leaving the refreshed job intact."""
    repo_id = f"repo-race-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    now = datetime.now(UTC)
    old_heartbeat = now - timedelta(seconds=200)

    # 1. Seed stale job in Redis
    record = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-renewed-1",
        commit_sha="sha1",
        status=ProcessingStatus.PROCESSING,
        started_at=old_heartbeat,
        updated_at=old_heartbeat,
        heartbeat_at=old_heartbeat,
    )
    await live_redis.set_cache(status_key, record.model_dump_json(), ttl_seconds=3600)
    await live_redis.add_to_set(active_set_key, repo_id)

    # 2. Recovery coordinator reads the stale record (observing old_heartbeat)
    observed = await live_redis.get_cache(status_key)
    assert observed is not None
    observed_record = ProcessingStatusRecord.model_validate_json(observed)

    # 3. RACE: Before recovery applies FAILED, worker renews heartbeat to NOW
    fresh_time = datetime.now(UTC)
    ok, reason = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-renewed-1",
        new_record_json="",
        ttl_seconds=3600,
        is_terminal=False,
        repository_id=repo_id,
        mode="heartbeat",
        new_heartbeat_at=fresh_time.isoformat(),
    )
    assert ok is True
    assert reason == "ok"

    # 4. Now recovery tries to apply FAILED with the previously observed heartbeat token
    failed_record = observed_record.model_copy(
        update={"status": ProcessingStatus.FAILED, "error": "timed out"}
    )
    ok_rec, reason_rec = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-renewed-1",
        new_record_json=failed_record.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=True,
        repository_id=repo_id,
        mode="reconcile",
        expected_heartbeat_at=observed_record.heartbeat_at.isoformat()
        if observed_record.heartbeat_at
        else "",
    )
    # Recovery MUST be rejected because heartbeat was renewed!
    assert ok_rec is False
    assert reason_rec == "heartbeat_renewed"

    # 5. Assert the job remains in active set and status is STILL PROCESSING
    members = await live_redis.get_set_members(active_set_key)
    assert repo_id in members
    cur = await live_redis.get_cache(status_key)
    assert cur is not None
    cur_rec = ProcessingStatusRecord.model_validate_json(cur)
    assert cur_rec.status == ProcessingStatus.PROCESSING

    # Clean up
    await live_redis.delete_cache(status_key)
    await live_redis.remove_from_set(active_set_key, repo_id)


@pytest.mark.asyncio
async def test_lua_rejects_delayed_processing_after_ready(
    live_redis: RedisClient,
) -> None:
    """Proves: Monotonic terminal state. A delayed PROCESSING write for the same job
    is rejected after READY has been established."""
    repo_id = f"repo-mono-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    now = datetime.now(UTC)
    ready_record = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-mono-1",
        commit_sha="sha-mono",
        status=ProcessingStatus.READY,
        started_at=now,
        updated_at=now,
    )
    ok, _ = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-mono-1",
        new_record_json=ready_record.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=True,
        repository_id=repo_id,
        mode="transition",
    )
    assert ok is True

    # Delayed progress callback arriving later for same job_id
    delayed_processing = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-mono-1",
        commit_sha="sha-mono",
        status=ProcessingStatus.PROCESSING,
        started_at=now,
        updated_at=datetime.now(UTC),
    )
    ok_delayed, reason_delayed = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-mono-1",
        new_record_json=delayed_processing.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=False,
        repository_id=repo_id,
        mode="transition",
    )
    assert ok_delayed is False
    assert reason_delayed == "already_terminal"

    # Status remains READY
    cur = await live_redis.get_cache(status_key)
    assert cur is not None
    assert ProcessingStatusRecord.model_validate_json(cur).status == ProcessingStatus.READY

    await live_redis.delete_cache(status_key)


@pytest.mark.asyncio
async def test_lua_heartbeat_does_not_regress_advanced_stage(
    live_redis: RedisClient,
) -> None:
    """Proves: Heartbeat updates only heartbeat_at/updated_at without regressing stage."""
    from app.domain.enums import ProcessingStage

    repo_id = f"repo-stage-{uuid.uuid4().hex[:8]}"
    status_key = f"{_STATUS_KEY_PREFIX}{repo_id}"
    active_set_key = _ACTIVE_INGESTIONS_KEY

    now = datetime.now(UTC)
    # Stage advanced to EMBEDDING with 75 chunks
    advanced_record = ProcessingStatusRecord(
        repository_id=repo_id,
        job_id="job-stage-1",
        commit_sha="sha1",
        status=ProcessingStatus.PROCESSING,
        stage=ProcessingStage.EMBEDDING,
        chunk_count=75,
        started_at=now,
        updated_at=now,
        heartbeat_at=now,
    )
    await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-stage-1",
        new_record_json=advanced_record.model_dump_json(),
        ttl_seconds=3600,
        is_terminal=False,
        repository_id=repo_id,
        mode="transition",
    )

    # Concurrent heartbeat runs with mode="heartbeat"
    future_time = datetime.now(UTC) + timedelta(seconds=15)
    ok, reason = await live_redis.eval_atomic_status_transition(
        status_key=status_key,
        active_set_key=active_set_key,
        expected_job_id="job-stage-1",
        new_record_json="",
        ttl_seconds=3600,
        is_terminal=False,
        repository_id=repo_id,
        mode="heartbeat",
        new_heartbeat_at=future_time.isoformat(),
    )
    assert ok is True

    # Verify stage and chunk_count are completely preserved!
    cur = await live_redis.get_cache(status_key)
    assert cur is not None
    cur_rec = ProcessingStatusRecord.model_validate_json(cur)
    assert cur_rec.stage == ProcessingStage.EMBEDDING
    assert cur_rec.chunk_count == 75

    await live_redis.delete_cache(status_key)
    await live_redis.remove_from_set(active_set_key, repo_id)


@pytest.mark.asyncio
async def test_acknowledgement_does_not_delete_other_attempt_callback(
    live_redis: RedisClient,
) -> None:
    """Proves: Acknowledging attempt A does not delete attempt B's callback."""
    repo_id = f"repo-multi-{uuid.uuid4().hex[:8]}"

    # Stage callback A
    await live_redis.record_pending_callback(
        repository_id=repo_id,
        job_id="job-attempt-A",
        payload_json='{"job_id": "job-attempt-A", "status": "completed"}',
    )
    # Stage callback B for the same repository
    await live_redis.record_pending_callback(
        repository_id=repo_id,
        job_id="job-attempt-B",
        payload_json='{"job_id": "job-attempt-B", "status": "completed"}',
    )

    # Acknowledge callback A
    await live_redis.acknowledge_pending_callback(repo_id, job_id="job-attempt-A")

    # Callback A is removed
    assert await live_redis.get_pending_callback(repo_id, job_id="job-attempt-A") is None

    # Callback B is STILL SAFELY PRESENT in Redis!
    payload_b = await live_redis.get_pending_callback(repo_id, job_id="job-attempt-B")
    assert payload_b is not None
    assert "job-attempt-B" in payload_b

    # Clean up
    await live_redis.acknowledge_pending_callback(repo_id, job_id="job-attempt-B")

