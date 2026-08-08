"""Unit tests for app/infra/cache/cache_client.py (Task 10).

These tests exercise the adapter's own logic (lazy construction,
configuration usage, error translation, retry, lock semantics, resource
lifecycle) against a minimal in-memory fake standing in for
``redis.asyncio.Redis`` -- not a real server. Live-server verification
is covered separately by
tests/integration/test_cache_client_integration.py, which runs against
the real, local Docker Redis container used during this task's
implementation.
"""

from __future__ import annotations

from typing import Any

import pytest
import redis.asyncio as redis

from app.config.settings import Settings
from app.domain.exceptions import CacheError
from app.infra.cache.cache_client import RedisClient


class FakeLock:
    def __init__(self, store: FakeRedis, name: str, timeout: float | None) -> None:
        self._store = store
        self.name = name
        self.timeout = timeout
        self.acquire_calls = 0
        self.release_calls = 0
        self.acquire_fail_times = 0
        self.release_error: Exception | None = None

    async def acquire(self, blocking: bool = False) -> bool:
        self.acquire_calls += 1
        if self.acquire_fail_times > 0:
            self.acquire_fail_times -= 1
            raise ConnectionError("simulated transient failure")
        if self.name in self._store.locks_held:
            return False
        self._store.locks_held.add(self.name)
        return True

    async def release(self) -> None:
        self.release_calls += 1
        if self.release_error is not None:
            raise self.release_error
        self._store.locks_held.discard(self.name)


class FakeRedis:
    def __init__(self, url: str | None = None, **kwargs: Any) -> None:
        self.url = url
        self.kwargs = kwargs
        self.store: dict[str, str] = {}
        self.locks_held: set[str] = set()
        self.locks_created: list[FakeLock] = []
        self.get_calls: list[str] = []
        self.set_calls: list[tuple[str, str, int | None]] = []
        self.get_fail_times = 0
        self.set_fail_times = 0
        self.ping_error: Exception | None = None
        self.closed = False

    async def get(self, key: str) -> str | None:
        self.get_calls.append(key)
        if self.get_fail_times > 0:
            self.get_fail_times -= 1
            raise ConnectionError("simulated transient failure")
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.set_calls.append((key, value, ex))
        if self.set_fail_times > 0:
            self.set_fail_times -= 1
            raise ConnectionError("simulated transient failure")
        if ex is not None and ex <= 0:
            raise ValueError("invalid expire time")
        self.store[key] = value
        return True

    async def ping(self) -> bool:
        if self.ping_error is not None:
            raise self.ping_error
        return True

    def lock(self, name: str, timeout: float | None = None, blocking: bool = True) -> FakeLock:
        lock = FakeLock(self, name, timeout)
        self.locks_created.append(lock)
        return lock

    async def aclose(self) -> None:
        self.closed = True


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> dict[str, FakeRedis]:
    holder: dict[str, FakeRedis] = {}

    def _from_url(url: str, **kwargs: Any) -> FakeRedis:
        instance = FakeRedis(url=url, **kwargs)
        holder["client"] = instance
        return instance

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(_from_url))
    return holder


# ---------------------------------------------------------------------------
# Client construction / configuration usage
# ---------------------------------------------------------------------------
async def test_client_is_not_constructed_until_first_use(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    assert client._client is None
    assert "client" not in fake_redis


async def test_uses_task_queue_broker_url_from_settings(
    fake_redis: dict[str, FakeRedis],
) -> None:
    settings = Settings(task_queue_broker_url="redis://example-host:6379/2")
    client = RedisClient(settings=settings)

    await client.get_cache("some-key")

    assert fake_redis["client"].url == "redis://example-host:6379/2"


async def test_reuses_the_same_connection_across_operations(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("k1")
    await client.set_cache("k2", "v2", ttl_seconds=60)

    assert len(fake_redis) == 1  # from_url invoked exactly once


async def test_requests_decode_responses_so_callers_get_str_not_bytes(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("k1")

    assert fake_redis["client"].kwargs.get("decode_responses") is True


# ---------------------------------------------------------------------------
# get_cache / set_cache
# ---------------------------------------------------------------------------
async def test_set_then_get_round_trips_the_exact_string(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    await client.set_cache("greeting", "hello world", ttl_seconds=60)

    assert await client.get_cache("greeting") == "hello world"


async def test_get_cache_miss_returns_none(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    assert await client.get_cache("never-set") is None


async def test_set_cache_passes_ttl_through_as_ex(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    await client.set_cache("key", "value", ttl_seconds=120)

    assert fake_redis["client"].set_calls == [("key", "value", 120)]


async def test_get_cache_never_prefixes_or_mutates_the_key(
    fake_redis: dict[str, FakeRedis],
) -> None:
    """No built-in namespacing (documented, not invented -- see module
    docstring): the adapter must pass the caller's key through unchanged."""
    client = RedisClient(settings=Settings())
    await client.get_cache("repository:abc-123:chunk:9")

    assert fake_redis["client"].get_calls == ["repository:abc-123:chunk:9"]


# ---------------------------------------------------------------------------
# Distributed locking
# ---------------------------------------------------------------------------
async def test_acquire_lock_yields_true_when_free(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    async with client.acquire_lock("job:repo-1", timeout=30) as acquired:
        assert acquired is True


async def test_acquire_lock_yields_false_when_already_held(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    async with client.acquire_lock("job:repo-1", timeout=30) as first:
        assert first is True
        async with client.acquire_lock("job:repo-1", timeout=30) as second:
            assert second is False  # non-blocking: must not wait for the first to release


async def test_lock_is_released_on_context_exit_and_reacquirable(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    async with client.acquire_lock("job:repo-1", timeout=30):
        pass

    async with client.acquire_lock("job:repo-1", timeout=30) as reacquired:
        assert reacquired is True


async def test_lock_is_released_even_if_the_guarded_block_raises(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    with pytest.raises(ValueError, match="boom"):
        async with client.acquire_lock("job:repo-1", timeout=30):
            raise ValueError("boom")

    async with client.acquire_lock("job:repo-1", timeout=30) as reacquired:
        assert reacquired is True


async def test_lock_release_failure_is_swallowed_not_raised(
    fake_redis: dict[str, FakeRedis],
) -> None:
    """A lock that already expired before release must not crash the
    caller's cleanup path -- logged and swallowed instead."""
    client = RedisClient(settings=Settings())
    async with client.acquire_lock("job:repo-1", timeout=30):
        lock = fake_redis["client"].locks_created[0]
        lock.release_error = ConnectionError("lock already expired")
    # No exception propagated out of the `async with` block above.


async def test_lock_timeout_is_forwarded_to_the_sdk_lock(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    async with client.acquire_lock("job:repo-1", timeout=45):
        pass

    assert fake_redis["client"].locks_created[0].timeout == 45


# ---------------------------------------------------------------------------
# Error translation + retry
# ---------------------------------------------------------------------------
async def test_transient_failure_retries_then_succeeds(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("warm-up")  # force client construction
    fake_redis["client"].get_fail_times = 2  # fails twice, succeeds on the 3rd (final) attempt

    result = await client.get_cache("k")

    assert result is None
    # warm-up call (1) + 2 failed retry attempts + 1 final successful attempt
    assert len(fake_redis["client"].get_calls) == 4


async def test_transient_failure_exhausts_retries_and_raises_cache_error(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("warm-up")
    fake_redis["client"].get_fail_times = 10  # always fails -- exceeds the retry budget

    with pytest.raises(CacheError) as exc_info:
        await client.get_cache("k")

    assert exc_info.value.category.value == "transient"
    assert exc_info.value.retryable is True
    assert isinstance(exc_info.value.__cause__, ConnectionError)


async def test_cache_error_raised_inside_an_operation_passes_through_unwrapped(
    fake_redis: dict[str, FakeRedis],
) -> None:
    """If a `CacheError` is already the exception in flight (e.g. from a
    nested adapter call), `_execute` must not double-wrap it into a second,
    less-informative `CacheError`."""
    client = RedisClient(settings=Settings())
    await client.get_cache("warm-up")

    async def _already_translated() -> None:
        raise CacheError("nested failure", details={"operation": "inner"})

    with pytest.raises(CacheError, match="nested failure"):
        await client._execute("outer_op", _already_translated)


async def test_non_retryable_error_is_translated_once_without_retrying(
    fake_redis: dict[str, FakeRedis],
) -> None:
    """A malformed request (e.g. a non-positive TTL, which Redis itself
    rejects) must be wrapped into a CacheError on the first attempt --
    retrying it would waste time on a failure retrying can never fix."""
    client = RedisClient(settings=Settings())

    with pytest.raises(CacheError, match="set_cache failed"):
        await client.set_cache("key", "value", ttl_seconds=0)

    assert len(fake_redis["client"].set_calls) == 1  # no retry attempted


# ---------------------------------------------------------------------------
# health_check (readiness)
# ---------------------------------------------------------------------------
async def test_health_check_true_on_successful_ping(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    assert await client.health_check() is True


async def test_health_check_false_on_ping_failure_never_raises(
    fake_redis: dict[str, FakeRedis],
) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("warm-up")  # force client construction
    fake_redis["client"].ping_error = ConnectionError("server unreachable")

    assert await client.health_check() is False


# ---------------------------------------------------------------------------
# Resource lifecycle
# ---------------------------------------------------------------------------
async def test_close_is_safe_when_client_was_never_constructed() -> None:
    client = RedisClient(settings=Settings())
    await client.close()  # must not raise


async def test_close_releases_the_constructed_client(fake_redis: dict[str, FakeRedis]) -> None:
    client = RedisClient(settings=Settings())
    await client.get_cache("warm-up")
    assert client._client is not None

    await client.close()

    assert client._client is None
    assert fake_redis["client"].closed is True
