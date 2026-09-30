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

Connection configuration: canonical ``Settings.redis_url`` resolves the
legacy TASK_QUEUE_BROKER_URL alias. Managed connections use verified TLS.
An optional key prefix isolates explicitly opted-in integration fixtures.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, TypeVar

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

_ATOMIC_TRANSITION_LUA = """
local status_key = KEYS[1]
local active_set_key = KEYS[2]
local pending_callback_key = KEYS[3]
local pending_deliveries_key = KEYS[4]

local expected_job_id = ARGV[1]
local new_json = ARGV[2]
local ttl = tonumber(ARGV[3])
local is_terminal = ARGV[4] == "1"
local repo_id = ARGV[5]
local mode = ARGV[6]
local expected_heartbeat_at = ARGV[7] or ""
local new_heartbeat_at = ARGV[8] or ""
local pending_callback_payload = ARGV[9] or ""
local delivery_id = ARGV[10] or repo_id

local current = redis.call("GET", status_key)
if current then
    local cur_obj = cjson.decode(current)
    local cur_job_id = cur_obj["job_id"]
    local cur_status = cur_obj["status"]

    -- 1. Attempt ownership check:
    if expected_job_id ~= "" and cur_job_id and cur_job_id ~= expected_job_id then
        return {0, "stale_attempt_mismatch"}
    end

    -- 2. New job admission (expected_job_id == ""):
    if expected_job_id == "" then
        if cur_status == "pending" or cur_status == "queued" or cur_status == "processing" then
            return {0, "job_already_in_flight"}
        end
        -- Terminal attempts may be replaced by a new admission.
    else
        -- 3. Monotonic terminal state checks for existing job (expected_job_id ~= ""):
        if cur_status == "ready" or cur_status == "failed" then
            if mode == "heartbeat" then
                return {0, "already_terminal"}
            end
            if not is_terminal then
                return {0, "already_terminal"}
            end
            if new_json ~= "" then
                local new_obj = cjson.decode(new_json)
                local new_status = new_obj["status"]
                if cur_status == "ready" and new_status == "failed" then
                    return {0, "cannot_fail_completed_job"}
                end
            end
        end

        -- 4. In-flight status monotonic progression for the same job:
        if cur_status == "processing" and new_json ~= "" then
            local new_obj = cjson.decode(new_json)
            local new_status = new_obj["status"]
            if new_status == "pending" or new_status == "queued" then
                return {0, "invalid_status_regression"}
            end
        end
    end

    -- 4. Heartbeat renewal mode: update ONLY heartbeat_at and updated_at on existing record
    if mode == "heartbeat" then
        cur_obj["heartbeat_at"] = new_heartbeat_at
        cur_obj["updated_at"] = new_heartbeat_at
        local updated_json = cjson.encode(cur_obj)
        redis.call("SET", status_key, updated_json, "EX", ttl)
        return {1, "ok"}
    end

    -- 5. Stale reconciliation check with atomic heartbeat verification:
    if mode == "reconcile" then
        if cur_status ~= "pending" and cur_status ~= "queued" and cur_status ~= "processing" then
            return {0, "not_in_flight"}
        end
        if expected_heartbeat_at ~= "" then
            local cur_heartbeat = cur_obj["heartbeat_at"] or cur_obj["updated_at"] or ""
            local cur_norm = string.gsub(cur_heartbeat, "%+00:00", "Z")
            local exp_norm = string.gsub(expected_heartbeat_at, "%+00:00", "Z")
            if cur_norm ~= exp_norm then
                return {0, "heartbeat_renewed"}
            end
        end
    end
end

-- Write new state atomically
redis.call("SET", status_key, new_json, "EX", ttl)

if is_terminal then
    redis.call("SREM", active_set_key, repo_id)
    if pending_callback_key and pending_callback_payload ~= "" then
        redis.call("SET", pending_callback_key, pending_callback_payload, "EX", 86400)
        if pending_deliveries_key then
            redis.call("SADD", pending_deliveries_key, delivery_id)
        end
    end
else
    redis.call("SADD", active_set_key, repo_id)
end

return {1, "ok"}
"""

_ATOMIC_DELETE_ATTEMPT_LUA = """
local status_key = KEYS[1]
local active_set_key = KEYS[2]
local expected_job_id = ARGV[1]
local repo_id = ARGV[2]

local current = redis.call("GET", status_key)
if current then
    local cur_obj = cjson.decode(current)
    local cur_job_id = cur_obj["job_id"]
    if expected_job_id ~= "" and cur_job_id and cur_job_id ~= expected_job_id then
        return {0, "stale_attempt_mismatch"}
    end
end

redis.call("DEL", status_key)
redis.call("SREM", active_set_key, repo_id)
return {1, "ok"}
"""


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

    def __init__(self, settings: Settings, *, key_prefix: str = "") -> None:
        self._settings = settings
        self._key_prefix = key_prefix
        self._client: redis.Redis | None = None
        self._log = logger.bind(component="cache_client")

    def _key(self, key: str) -> str:
        return self._key_prefix + key

    # ------------------------------------------------------------------
    # SDK client construction (lazy, async connection pool)
    # ------------------------------------------------------------------
    def _get_client(self) -> redis.Redis:
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self._client is not None:
            client_loop = getattr(self, "_created_loop", None)
            if client_loop is not None and (
                client_loop.is_closed()
                or (current_loop is not None and client_loop is not current_loop)
            ):
                raise CacheError(
                    "Redis client must be closed in its owning event loop before reuse"
                )

        if self._client is None:
            tls_options: dict[str, Any] = {}
            if self._settings.redis_url.startswith("rediss://"):
                tls_options = {"ssl_cert_reqs": "required", "ssl_check_hostname": True}
            self._client = redis.Redis.from_url(
                self._settings.redis_url,
                decode_responses=True,
                max_connections=self._settings.redis_max_connections,
                socket_connect_timeout=self._settings.redis_socket_connect_timeout_seconds,
                socket_timeout=self._settings.redis_socket_timeout_seconds,
                **tls_options,
            )
            self._created_loop = current_loop
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
                error_type=type(exc).__name__,
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
                error_type=type(exc).__name__,
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
            value: str | None = await self._get_client().get(self._key(key))
            return value

        return await self._execute("get_cache", _op)

    async def set_cache(self, key: str, value: str, ttl_seconds: int) -> None:
        """Sets ``key`` to ``value`` with a mandatory TTL (§Best Practices --
        every cached item expires; there is no non-expiring `set`)."""

        async def _op() -> None:
            await self._get_client().set(self._key(key), value, ex=ttl_seconds)

        await self._execute("set_cache", _op)

    async def delete_cache(self, key: str) -> None:
        """Deletes ``key`` from cache."""

        async def _op() -> None:
            await self._get_client().delete(self._key(key))

        await self._execute("delete_cache", _op)

    async def add_to_set(self, key: str, member: str) -> None:
        """Adds a member to a Redis set."""

        async def _op() -> None:
            await self._get_client().sadd(self._key(key), member)  # type: ignore[misc]

        await self._execute("add_to_set", _op)

    async def remove_from_set(self, key: str, member: str) -> None:
        """Removes a member from a Redis set."""

        async def _op() -> None:
            await self._get_client().srem(self._key(key), member)  # type: ignore[misc]

        await self._execute("remove_from_set", _op)

    async def get_set_members(self, key: str) -> set[str]:
        """Returns all members of a Redis set."""

        async def _op() -> set[str]:
            res = await self._get_client().smembers(self._key(key))  # type: ignore[misc]
            return set(res)

        return await self._execute("get_set_members", _op)

    async def sscan_members(
        self, key: str, cursor: int = 0, count: int = 50
    ) -> tuple[int, list[str]]:
        """Cursor-based bounded scan of Redis set members (Task T5)."""

        async def _op() -> tuple[int, list[str]]:
            client = self._get_client()
            new_cursor, raw_members = await client.sscan(self._key(key), cursor=cursor, count=count)
            members = [m.decode("utf-8") if isinstance(m, bytes) else str(m) for m in raw_members]
            return int(new_cursor), members

        return await self._execute("sscan_members", _op)

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
        """Atomically validates attempt ownership, checks monotonicity, and
        updates status and active set."""
        client = self._get_client()
        pending_callback_key = (
            f"seis:pending-callback:{repository_id}:{expected_job_id}"
            if expected_job_id
            else f"seis:pending-callback:{repository_id}"
        )
        pending_deliveries_key = "seis:pending-callback-deliveries"
        delivery_id = f"{repository_id}:{expected_job_id}" if expected_job_id else repository_id

        keys = [
            self._key(k)
            for k in (status_key, active_set_key, pending_callback_key, pending_deliveries_key)
        ]
        args = [
            expected_job_id or "",
            new_record_json,
            str(ttl_seconds),
            "1" if is_terminal else "0",
            repository_id,
            mode,
            expected_heartbeat_at or "",
            new_heartbeat_at or "",
            pending_callback_payload or "",
            delivery_id,
        ]

        async def _op() -> tuple[bool, str]:
            res = await client.eval(_ATOMIC_TRANSITION_LUA, len(keys), *keys, *args)  # type: ignore[misc]
            code, reason = int(res[0]), str(res[1])
            return (code == 1, reason)

        return await self._execute("atomic_status_transition", _op)

    async def eval_atomic_delete_attempt(
        self,
        status_key: str,
        active_set_key: str,
        expected_job_id: str | None,
        repository_id: str,
    ) -> tuple[bool, str]:
        """Atomically deletes status record and active set entry only if expected_job_id matches."""
        client = self._get_client()
        keys = [self._key(status_key), self._key(active_set_key)]
        args = [expected_job_id or "", repository_id]

        async def _op() -> tuple[bool, str]:
            res = await client.eval(_ATOMIC_DELETE_ATTEMPT_LUA, len(keys), *keys, *args)  # type: ignore[misc]
            code, reason = int(res[0]), str(res[1])
            return (code == 1, reason)

        return await self._execute("atomic_delete_attempt", _op)

    async def record_pending_callback(
        self,
        repository_id: str,
        payload_json: str,
        job_id: str | None = None,
        ttl_seconds: int = 86400,
    ) -> None:
        """Durably stages a terminal callback with attempt identity before delivery."""
        key = (
            f"seis:pending-callback:{repository_id}:{job_id}"
            if job_id
            else f"seis:pending-callback:{repository_id}"
        )
        delivery_id = f"{repository_id}:{job_id}" if job_id else repository_id

        async def _op() -> None:
            pipe = self._get_client().pipeline()
            pipe.set(self._key(key), payload_json, ex=ttl_seconds)
            pipe.sadd(self._key("seis:pending-callback-deliveries"), delivery_id)
            await pipe.execute()

        await self._execute("record_pending_callback", _op)

    async def acknowledge_pending_callback(
        self, repository_id: str, job_id: str | None = None
    ) -> None:
        """Acknowledges confirmed delivery or safe supersession of a terminal callback."""

        async def _op() -> None:
            pipe = self._get_client().pipeline()
            if job_id:
                pipe.delete(self._key(f"seis:pending-callback:{repository_id}:{job_id}"))
                pipe.srem(
                    self._key("seis:pending-callback-deliveries"), f"{repository_id}:{job_id}"
                )
            # Also clean up legacy un-scoped key if present
            pipe.delete(self._key(f"seis:pending-callback:{repository_id}"))
            pipe.srem(self._key("seis:pending-callback-deliveries"), repository_id)
            await pipe.execute()

        await self._execute("acknowledge_pending_callback", _op)

    async def get_pending_callback(
        self, repository_id: str, job_id: str | None = None
    ) -> str | None:
        """Retrieves a staged pending callback payload."""
        if job_id:
            val = await self.get_cache(f"seis:pending-callback:{repository_id}:{job_id}")
            if val is not None:
                return val
            return await self.get_cache(f"seis:pending-callback:{repository_id}")

        val = await self.get_cache(f"seis:pending-callback:{repository_id}")
        if val is not None:
            return val

        deliveries = await self.get_set_members("seis:pending-callback-deliveries")
        prefix = f"{repository_id}:"
        for d in deliveries:
            if d.startswith(prefix):
                scoped_val = await self.get_cache(f"seis:pending-callback:{d}")
                if scoped_val is not None:
                    return scoped_val
        return None

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
        lock = client.lock(self._key(lock_name), timeout=timeout, blocking=False)
        acquired = await self._execute("acquire_lock", lambda: lock.acquire(blocking=False))
        hold_started = time.perf_counter()
        try:
            yield acquired
        finally:
            if acquired:
                hold_seconds = round(time.perf_counter() - hold_started, 3)
                self._log.debug(
                    "cache.lock_hold_duration", hold_seconds=hold_seconds, lease_seconds=timeout
                )
                if hold_seconds >= timeout * 0.8:
                    self._log.warning(
                        "cache.lock_lease_headroom_low",
                        hold_seconds=hold_seconds,
                        lease_seconds=timeout,
                    )
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
            return await asyncio.wait_for(
                _ping(), timeout=self._settings.redis_readiness_timeout_seconds
            )
        except Exception as exc:
            self._log.warning("cache.health_check_failed", error_type=type(exc).__name__)
            return False

    async def close(self) -> None:
        """Releases the underlying connection pool, if one was ever constructed."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._log.debug("cache.client_closed")
