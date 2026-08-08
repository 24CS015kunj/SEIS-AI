"""Integration test for app/core/embedding/embedding_cache.py (Task 16).

Requires a real, reachable Redis server, same as Task 10/11's
integration suites:

    docker run -d --name seis-redis-dev -p 6379:6379 redis:7-alpine

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
from app.core.embedding.embedding_cache import EmbeddingCache, compute_chunk_hash
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
async def redis_client(settings: Settings) -> AsyncGenerator[RedisClient]:
    client = RedisClient(settings=settings)
    yield client
    await client.close()


@pytest.fixture
def cache(redis_client: RedisClient, settings: Settings) -> EmbeddingCache:
    return EmbeddingCache(redis_client=redis_client, settings=settings)


async def test_cache_miss_against_live_redis(cache: EmbeddingCache) -> None:
    content_hash = compute_chunk_hash(f"itest-miss-{uuid.uuid4().hex}", "text-embedding-004")
    assert await cache.get_cached_embeddings([content_hash]) == {}


async def test_cache_hit_after_write_against_live_redis(cache: EmbeddingCache) -> None:
    content = f"itest-hit-{uuid.uuid4().hex}"
    content_hash = compute_chunk_hash(content, "text-embedding-004")
    vector = [0.1, 0.2, 0.3, 0.4]

    await cache.cache_embeddings({content_hash: vector})
    result = await cache.get_cached_embeddings([content_hash])

    assert result == {content_hash: vector}


async def test_repeated_content_skips_recomputation_against_live_redis(
    cache: EmbeddingCache,
) -> None:
    content = f"itest-repeat-{uuid.uuid4().hex}"
    model_version = "text-embedding-004"
    vector = [0.9, 0.8, 0.7]

    first_hash = compute_chunk_hash(content, model_version)
    assert await cache.get_cached_embeddings([first_hash]) == {}
    await cache.cache_embeddings({first_hash: vector})

    # Re-processing the identical content later yields the identical
    # hash and a cache hit -- the Task 16 Validation criterion.
    second_hash = compute_chunk_hash(content, model_version)
    assert second_hash == first_hash
    assert await cache.get_cached_embeddings([second_hash]) == {first_hash: vector}
