"""Opt-in Redis application acceptance (local TCP or managed verified TLS).

Requires TEST_REDIS_URL in the process environment. Every test uses a
random prefix, including active sets, Lua keys, outbox, history and cache.
Cleanup deletes only that prefix. Configured but unreachable fixtures fail;
an absent fixture is skipped. This suite never starts Docker or a database.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import LockNotOwnedError

from app.config.settings import Settings
from app.core.embedding.embedding_cache import EmbeddingCache
from app.core.generation.conversation_store import ConversationStore
from app.domain.enums import ProcessingStatus
from app.domain.models import ProcessingStatusRecord
from app.infra.cache.cache_client import RedisClient
from app.services.repository_processing_service import RepositoryProcessingService

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_REDIS_URL"),
    reason="Set TEST_REDIS_URL explicitly; managed acceptance is pending without it",
)


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, service_env="testing", redis_url=os.environ["TEST_REDIS_URL"])


@pytest.fixture
async def client(settings: Settings) -> AsyncGenerator[RedisClient]:
    prefix = f"t6-itest:{uuid.uuid4().hex}:"
    redis_client = RedisClient(settings=settings, key_prefix=prefix)
    try:
        assert await redis_client.health_check(), "Test Redis connectivity failed"
        yield redis_client
    finally:
        try:
            # Only this run's random prefix; never scan/reconcile production sets.
            sdk = redis_client._get_client()
            async for key in sdk.scan_iter(match=prefix + "*", count=100):
                await sdk.delete(key)
        finally:
            await redis_client.close()


async def test_health_check_reports_true_against_live_redis(client: RedisClient) -> None:
    assert await client.health_check() is True


async def test_set_then_get_round_trips_against_live_redis(client: RedisClient) -> None:
    key = f"itest:{uuid.uuid4().hex[:8]}"
    await client.set_cache(key, "hello from Task 10", ttl_seconds=30)

    assert await client.get_cache(key) == "hello from Task 10"


async def test_get_cache_miss_against_live_redis(client: RedisClient) -> None:
    key = f"itest:missing:{uuid.uuid4().hex[:8]}"
    assert await client.get_cache(key) is None


async def test_ttl_expiry_against_live_redis(client: RedisClient) -> None:
    key = f"itest:ttl:{uuid.uuid4().hex[:8]}"
    await client.set_cache(key, "short-lived", ttl_seconds=1)

    assert await client.get_cache(key) == "short-lived"
    await asyncio.sleep(1.5)
    assert await client.get_cache(key) is None


async def test_distributed_lock_prevents_concurrent_acquisition(
    settings: Settings, client: RedisClient
) -> None:
    lock_name = f"itest:lock:{uuid.uuid4().hex[:8]}"
    other_client = RedisClient(settings=settings, key_prefix=client._key_prefix)
    try:
        async with client.acquire_lock(lock_name, timeout=10) as first_acquired:
            assert first_acquired is True
            async with other_client.acquire_lock(lock_name, timeout=10) as second_acquired:
                assert second_acquired is False

        async with other_client.acquire_lock(lock_name, timeout=10) as reacquired:
            assert reacquired is True
    finally:
        await other_client.close()


async def test_expired_lock_cannot_release_another_owners_lock(client: RedisClient) -> None:
    sdk = client._get_client()
    name = client._key("expired-lock")
    old = sdk.lock(name, timeout=0.1, blocking=False)
    new = sdk.lock(name, timeout=10, blocking=False)
    assert await old.acquire(blocking=False)
    await asyncio.sleep(0.2)
    assert await new.acquire(blocking=False)
    try:
        with pytest.raises(LockNotOwnedError):
            await old.release()
        assert await new.owned()
    finally:
        await new.release()


async def test_application_lua_attempts_outbox_and_recovery(
    client: RedisClient,
    settings: Settings,
) -> None:
    repo = "fixture-repo"
    status_key = f"seis:repo-processing-status:{repo}"
    active_key = "seis:active-ingestions"
    now = datetime.now(UTC)

    def record(job: str, state: ProcessingStatus) -> str:
        return ProcessingStatusRecord(
            repository_id=repo,
            job_id=job,
            status=state,
            commit_sha="fixture-sha",
            started_at=now,
            updated_at=now,
            heartbeat_at=now,
        ).model_dump_json()

    async def transition(
        job: str | None, new_job: str, state: ProcessingStatus, **options: object
    ) -> tuple[bool, str]:
        return await client.eval_atomic_status_transition(
            status_key,
            active_key,
            job,
            record(new_job, state),
            60,
            state in {ProcessingStatus.READY, ProcessingStatus.FAILED},
            repo,
            **options,
        )

    start = time.perf_counter()
    async with client.acquire_lock("submission-lock", timeout=10) as acquired:
        assert acquired
        assert (await transition(None, "A", ProcessingStatus.PENDING))[0]
        assert not (await transition(None, "B", ProcessingStatus.PENDING))[0]
        assert (await transition("A", "A", ProcessingStatus.PROCESSING))[0]
    duration = time.perf_counter() - start
    print(f"T6 lock critical section incl acquire/release: {duration:.3f}s")
    assert duration < 8, "Managed lock operations need more lease headroom before deployment"
    assert await client.get_set_members(active_key) == {repo}
    cursor, members = await client.sscan_members(active_key, count=100)
    assert cursor == 0 and members == [repo]
    assert (
        await transition(
            "A",
            "A",
            ProcessingStatus.PROCESSING,
            mode="heartbeat",
            new_heartbeat_at=now.isoformat(),
        )
    )[0]
    assert not (
        await transition(
            "A",
            "A",
            ProcessingStatus.FAILED,
            mode="reconcile",
            expected_heartbeat_at="old-heartbeat",
        )
    )[0]
    payload = json.dumps({"repository_id": repo, "job_id": "A", "status": "ready"})
    assert (await transition("A", "A", ProcessingStatus.READY, pending_callback_payload=payload))[0]
    assert await client.get_pending_callback(repo, "A") == payload
    assert await client.get_set_members(active_key) == set()
    assert not (await transition("A", "A", ProcessingStatus.FAILED))[0]
    assert not (await transition("A", "A", ProcessingStatus.PROCESSING))[0]

    callback = AsyncMock()
    callback.send_status_update.return_value = True
    service = RepositoryProcessingService(
        cache_client=client,
        job_manager=MagicMock(),
        express_callback_client=callback,
        settings=settings,
    )
    assert await service.flush_pending_callbacks() == 1
    assert await client.get_pending_callback(repo, "A") is None
    assert (await transition(None, "B", ProcessingStatus.PENDING))[0]
    assert not (await transition("A", "A", ProcessingStatus.FAILED))[0]
    assert not (await client.eval_atomic_delete_attempt(status_key, active_key, "A", repo))[0]
    assert (
        await transition(
            "B",
            "B",
            ProcessingStatus.FAILED,
            mode="reconcile",
            expected_heartbeat_at=now.isoformat(),
        )
    )[0]
    await client.record_pending_callback(repo, payload, job_id="A", ttl_seconds=60)
    await client.record_pending_callback(repo, "fixture-B", job_id="B", ttl_seconds=60)
    await client.acknowledge_pending_callback(repo, job_id="A")
    assert await client.get_pending_callback(repo, "B") == "fixture-B"
    await client.acknowledge_pending_callback(repo, job_id="B")
    assert (await client.eval_atomic_delete_attempt(status_key, active_key, "B", repo))[0]


async def test_conversations_and_embeddings_share_isolated_managed_adapter(
    client: RedisClient,
    settings: Settings,
) -> None:
    history = ConversationStore(cache_client=client, settings=settings)
    await history.append_turn("repo-A", "chat-1", "fixture question", "fixture answer")
    assert len(await history.load_history("repo-A", "chat-1")) == 2
    assert await history.load_history("repo-B", "chat-1") == []
    embeddings = EmbeddingCache(redis_client=client, settings=settings)
    assert await embeddings.get_cached_embeddings(["fixture-hash"]) == {}
    vector = [0.001 * i for i in range(2048)]
    await embeddings.cache_embeddings({"fixture-hash": vector})
    assert await embeddings.get_cached_embeddings(["fixture-hash"]) == {"fixture-hash": vector}
    assert await client._get_client().ttl(client._key("embed:fixture-hash")) > 0


async def test_empty_recovery_has_only_two_set_scans(
    client: RedisClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sdk = client._get_client()
    execute = sdk.execute_command
    commands: list[str] = []

    async def counted_command(*args: object, **kwargs: object) -> object:
        commands.append(str(args[0]))
        return await execute(*args, **kwargs)

    monkeypatch.setattr(sdk, "execute_command", counted_command)
    service = RepositoryProcessingService(
        cache_client=client,
        job_manager=MagicMock(),
        express_callback_client=AsyncMock(),
        settings=settings,
    )
    assert await service.reconcile_interrupted_jobs() == 0
    assert commands == ["SSCAN", "SSCAN"]
    print("T6 empty recovery command count: 2 SSCAN")
