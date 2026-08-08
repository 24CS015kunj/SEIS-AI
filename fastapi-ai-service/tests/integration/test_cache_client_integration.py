"""Integration test for app/infra/cache/cache_client.py (Task 10).

Requires a real, reachable Redis server at the configured
``TASK_QUEUE_BROKER_URL`` (default ``redis://localhost:6379/0``).
Unlike ChromaDB (Task 9), the ``redis`` client library is pure Python
and installs natively on Windows -- only the *server* needs Docker
(ADR-005). During this task's implementation, verification ran against
a real, local, open-source Redis 7 container:

    docker run -d --name seis-redis-dev -p 6379:6379 redis:7-alpine

This is a temporary developer-verification container, not the Task 14
production Docker Compose stack -- it is not created or managed by any
application code, only by the developer/operator running this suite.

If no Redis server is reachable, this whole module is skipped with an
explicit reason rather than silently reporting a false pass.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator

import pytest
import redis.asyncio as redis

from app.config.settings import Settings, get_settings
from app.infra.cache.cache_client import RedisClient


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
    reason=(
        f"No Redis server reachable at "
        f"{_settings_for_skip_check.task_queue_broker_url!r}. Start one locally, e.g. "
        f"`docker run -d --name seis-redis-dev -p 6379:6379 redis:7-alpine`, and re-run."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
async def client(settings: Settings) -> AsyncGenerator[RedisClient]:
    redis_client = RedisClient(settings=settings)
    yield redis_client
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
    other_client = RedisClient(settings=settings)
    try:
        async with client.acquire_lock(lock_name, timeout=10) as first_acquired:
            assert first_acquired is True
            async with other_client.acquire_lock(lock_name, timeout=10) as second_acquired:
                assert second_acquired is False

        async with other_client.acquire_lock(lock_name, timeout=10) as reacquired:
            assert reacquired is True
    finally:
        await other_client.close()
