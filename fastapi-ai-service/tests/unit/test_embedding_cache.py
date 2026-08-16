"""Unit tests for app/core/embedding/embedding_cache.py (Task 16).

Uses a fake in-memory store behind the real ``RedisClient``'s public
methods (monkeypatched, so no network I/O happens) -- exercises
``EmbeddingCache``'s own hashing/serialization/lookup logic in
isolation. Real-Redis verification is covered separately by
tests/integration/test_embedding_cache_integration.py.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.core.embedding.embedding_cache import EmbeddingCache, compute_chunk_hash
from app.infra.cache.cache_client import RedisClient


@pytest.fixture
def fake_redis_client(monkeypatch: pytest.MonkeyPatch) -> RedisClient:
    store: dict[str, str] = {}
    client = RedisClient(settings=Settings())

    async def _get_cache(key: str) -> str | None:
        return store.get(key)

    async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
        store[key] = value

    monkeypatch.setattr(client, "get_cache", _get_cache)
    monkeypatch.setattr(client, "set_cache", _set_cache)
    return client


def test_compute_chunk_hash_is_deterministic() -> None:
    first = compute_chunk_hash("def foo(): ...", "text-embedding-004")
    second = compute_chunk_hash("def foo(): ...", "text-embedding-004")
    assert first == second
    assert len(first) == 64  # sha256 hex digest length


def test_compute_chunk_hash_differs_for_different_content() -> None:
    a = compute_chunk_hash("def foo(): ...", "text-embedding-004")
    b = compute_chunk_hash("def bar(): ...", "text-embedding-004")
    assert a != b


def test_compute_chunk_hash_differs_for_different_model_version() -> None:
    a = compute_chunk_hash("def foo(): ...", "text-embedding-004")
    b = compute_chunk_hash("def foo(): ...", "text-embedding-005")
    assert a != b


async def test_cache_miss_for_unseen_hash(fake_redis_client: RedisClient) -> None:
    cache = EmbeddingCache(redis_client=fake_redis_client, settings=Settings())
    result = await cache.get_cached_embeddings(["missing-hash"])
    assert result == {}


async def test_cache_write_then_read_round_trips(fake_redis_client: RedisClient) -> None:
    cache = EmbeddingCache(redis_client=fake_redis_client, settings=Settings())
    content_hash = compute_chunk_hash("def foo(): ...", "text-embedding-004")

    await cache.cache_embeddings({content_hash: [0.1, 0.2, 0.3]})
    result = await cache.get_cached_embeddings([content_hash])

    assert result == {content_hash: [0.1, 0.2, 0.3]}


async def test_get_cached_embeddings_returns_only_hits_mixed_with_misses(
    fake_redis_client: RedisClient,
) -> None:
    cache = EmbeddingCache(redis_client=fake_redis_client, settings=Settings())
    hash_a = compute_chunk_hash("a", "text-embedding-004")
    hash_b = compute_chunk_hash("b", "text-embedding-004")

    await cache.cache_embeddings({hash_a: [1.0]})
    result = await cache.get_cached_embeddings([hash_a, hash_b])

    assert result == {hash_a: [1.0]}
    assert hash_b not in result


async def test_identical_content_produces_a_cache_hit_on_second_lookup(
    fake_redis_client: RedisClient,
) -> None:
    """The task's own Validation criterion: passing identical text twice
    means the second lookup is a hit -- the caller can skip the
    embedding API call it would otherwise have made.
    """
    cache = EmbeddingCache(redis_client=fake_redis_client, settings=Settings())
    content = "def add(a, b):\n    return a + b\n"
    model_version = "text-embedding-004"

    first_hash = compute_chunk_hash(content, model_version)
    assert await cache.get_cached_embeddings([first_hash]) == {}

    await cache.cache_embeddings({first_hash: [0.5, 0.6]})

    second_hash = compute_chunk_hash(content, model_version)
    assert second_hash == first_hash
    assert await cache.get_cached_embeddings([second_hash]) == {first_hash: [0.5, 0.6]}


async def test_cache_embeddings_uses_the_configured_ttl(
    fake_redis_client: RedisClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorded_ttls: list[int] = []

    async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
        recorded_ttls.append(ttl_seconds)

    monkeypatch.setattr(fake_redis_client, "set_cache", _set_cache)

    settings = Settings(embedding_cache_ttl_seconds=123)
    cache = EmbeddingCache(redis_client=fake_redis_client, settings=settings)
    await cache.cache_embeddings({"h1": [1.0]})

    assert recorded_ttls == [123]


async def test_cache_embeddings_with_empty_map_writes_nothing(
    fake_redis_client: RedisClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
        calls.append(key)

    monkeypatch.setattr(fake_redis_client, "set_cache", _set_cache)

    cache = EmbeddingCache(redis_client=fake_redis_client, settings=Settings())
    await cache.cache_embeddings({})

    assert calls == []
