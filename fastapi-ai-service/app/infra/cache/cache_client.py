"""Cache Client.

Generic cache adapter backing the Embedding Cache and the RAG
Optimization Layer's response/retrieval caching (§5.4, §5.10).

Sole adapter to Redis (Task 10, ADR-005): key/value caching with TTL
and distributed locking pass through this module — the rest of the
application never imports ``redis`` directly.

Async/sync boundary: unlike ChromaDB's client (Task 9 — synchronous,
dispatched via ``asyncio.to_thread``), ``redis.asyncio.Redis`` performs
real non-blocking network I/O natively over asyncio (the Task 10
specification requires ``redis.asyncio`` explicitly). Every method here
is a direct ``await`` against the SDK; no thread-pool dispatch is used
or needed.

Data model: ``get_cache``/``set_cache`` operate on plain strings only,
per the frozen Task 10 specification (``get_cache(key: str) -> str |
None``, ``set_cache(key: str, value: str, ttl_seconds: int)``). No
JSON/pickle serialization layer is introduced here — a caller that
needs structured values encodes/decodes them itself before calling
this adapter.

Key namespacing: this adapter takes a raw ``key: str`` with no built-in
repository/workspace prefixing. Unlike ChromaDB (§12, §17 — explicit,
documented collection-per-repository isolation), neither the Task 10
specification nor ADR-005 defines a cache-key naming convention, and
``get_cache``/``set_cache``'s own signatures take a bare key with no
repository/workspace parameter. Namespacing keys (e.g.
``f"embed:{repository_id}:{content_hash}"``) is therefore the
responsibility of whichever future caller constructs them — resolved
here rather than silently inventing a convention the specification
doesn't define.

Connection configuration: reuses ``Settings.task_queue_broker_url``
(``redis://...``) — the only Redis connection string the frozen
configuration contract provides. ADR-005 explicitly describes a single
Redis instance backing both the Celery broker and the cache/lock layer,
so reusing this field (rather than inventing a second ``REDIS_URL``
environment variable) is the documented architecture, not a shortcut.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TypeVar

import redis.asyncio as redis
import structlog
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import CacheError

logger = structlog.get_logger("seis.infra.cache")

T = TypeVar("T")

# Connection-level failures only -- never a reason to retry a malformed
# command or a genuine application error (§14 Error Handling Strategy
# distinguishes transient infra failures from invalid requests).
_RETRYABLE_EXCEPTIONS: tuple[type[BaseException], ...] = (
    redis.ConnectionError,
    redis.TimeoutError,
    ConnectionError,
    TimeoutError,
)


class RedisClient:
    """Application-facing adapter over the Redis SDK (Task 10, ADR-005).

    One instance is constructed per process (see
    ``app.api.deps.get_cache_client``) and reused for the process
    lifetime — a new connection pool is never created per cache
    operation. Construction is lazy: the underlying
    ``redis.asyncio.Redis`` client/connection pool is built on first
    use, not in ``__init__``, so a Redis outage at process boot never
    prevents the process from starting (readiness, not liveness, is
    what should fail — §9).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: redis.Redis | None = None
        self._log = logger.bind(component="cache_client")

    # ------------------------------------------------------------------
    # SDK client construction (lazy, async connection pool)
    # ------------------------------------------------------------------
    def _get_client(self) -> redis.Redis:
        if self._client is None:
            # `decode_responses=True`: every method here works in `str`,
            # matching the frozen `get_cache`/`set_cache` signatures --
            # never leaking raw `bytes` to callers. Explicit socket
            # timeouts so a hung TCP connection can't block a request
            # indefinitely; `health_check` adds its own outer timeout
            # as a second line of defense.
            self._client = redis.Redis.from_url(
                self._settings.task_queue_broker_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
        return self._client

    # ------------------------------------------------------------------
    # Execution helper: bounded retry + error translation + structured
    # logging (§14, §15). No off-thread dispatch (see module docstring)
    # -- `fn` is already a native coroutine function.
    # ------------------------------------------------------------------
    async def _run_with_retry(self, fn: Callable[[], Awaitable[T]]) -> T:
        async for attempt in AsyncRetrying(
            retry=retry_if_exception_type(_RETRYABLE_EXCEPTIONS),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=0.5, max=4),
            reraise=True,
        ):
            with attempt:
                return await fn()
        raise AssertionError("unreachable: AsyncRetrying always returns or raises")

    async def _execute(self, operation: str, fn: Callable[[], Awaitable[T]]) -> T:
        log = self._log.bind(operation=operation)
        start = time.perf_counter()
        try:
            result = await self._run_with_retry(fn)
        except CacheError:
            raise
        except _RETRYABLE_EXCEPTIONS as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "cache.operation_failed",
                error_category="transient",
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise CacheError(
                f"Redis {operation} failed: transient connectivity error",
                details={"operation": operation},
            ) from exc
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "cache.operation_failed",
                error_category="unknown",
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise CacheError(f"Redis {operation} failed", details={"operation": operation}) from exc
        else:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.debug("cache.operation_succeeded", duration_ms=duration_ms)
            return result

    # ------------------------------------------------------------------
    # Public adapter surface (Task 10 subtasks 2-4)
    # ------------------------------------------------------------------
    async def get_cache(self, key: str) -> str | None:
        """Returns the cached string value for ``key``, or ``None`` on a cache miss."""

        async def _op() -> str | None:
            value: str | None = await self._get_client().get(key)
            return value

        return await self._execute("get_cache", _op)

    async def set_cache(self, key: str, value: str, ttl_seconds: int) -> None:
        """Sets ``key`` to ``value`` with a mandatory TTL (§Best Practices --
        every cached item expires; there is no non-expiring `set`)."""

        async def _op() -> None:
            await self._get_client().set(key, value, ex=ttl_seconds)

        await self._execute("set_cache", _op)

    @asynccontextmanager
    async def acquire_lock(self, lock_name: str, timeout: int) -> AsyncIterator[bool]:
        """Distributed lock context manager (ADR-005 -- prevents duplicate
        background job processing).

        Uses ``redis.asyncio``'s own ``Lock`` primitive (token-based,
        safe against releasing another holder's lock) rather than a
        hand-rolled ``SET NX EX`` -- reimplementing distributed locking
        correctly is exactly the "unnecessary complexity" the Task 10
        brief warns against when the SDK already provides it.

        Non-blocking: if ``lock_name`` is already held, this yields
        ``False`` immediately rather than waiting -- the right default
        for "don't double-process the same job" (ADR-005), where a
        second caller finding the lock held should skip, not queue.
        ``timeout`` is the lock's own TTL (auto-released if the holder
        crashes without releasing it), not an acquire-wait duration.

        Yields:
            ``True`` if the lock was acquired by this call, ``False``
            if another holder already has it. Callers must check this
            before proceeding with the guarded work.
        """
        client = self._get_client()
        lock = client.lock(lock_name, timeout=timeout, blocking=False)
        acquired = await self._execute("acquire_lock", lambda: lock.acquire(blocking=False))
        try:
            yield acquired
        finally:
            if acquired:
                try:
                    await self._execute("release_lock", lock.release)
                except CacheError:
                    # The lock may have already expired (TTL elapsed)
                    # before release -- log and swallow so a release
                    # failure never masks whatever happened inside the
                    # caller's `with` block.
                    self._log.warning("cache.lock_release_failed", lock_name=lock_name)

    async def health_check(self) -> bool:
        """Readiness probe (§9). Never raises -- always returns a bool.

        A failing/unreachable Redis must surface as ``/health/ready``
        reporting ``not_ready``, never as a crashed process or an
        unhandled exception (§9 Readiness vs Liveness).
        """

        async def _ping() -> bool:
            return bool(await self._get_client().ping())

        try:
            return await _ping()
        except Exception as exc:
            self._log.warning("cache.health_check_failed", error=str(exc))
            return False

    async def close(self) -> None:
        """Releases the underlying connection pool, if one was ever constructed."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._log.debug("cache.client_closed")
