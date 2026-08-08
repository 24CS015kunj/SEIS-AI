"""Integration test for app/infra/queue/task_queue.py (Task 11).

Requires a real, reachable Redis server at the configured
``TASK_QUEUE_BROKER_URL`` (default ``redis://localhost:6379/0``) --
Celery's broker connection check genuinely dials it. During this
task's implementation, verification ran against the same real, local,
open-source Redis 7 container used for Task 10:

    docker run -d --name seis-redis-dev -p 6379:6379 redis:7-alpine

This is a temporary developer-verification container, not the Task 14
production Docker Compose stack, and no worker process is started --
Task 11 only configures the Celery *application*; running a worker is
Task 40's job.

If no Redis server is reachable, this whole module is skipped with an
explicit reason rather than silently reporting a false pass.
"""

from __future__ import annotations

import asyncio

import pytest
import redis.asyncio as redis

from app.config.settings import get_settings
from app.infra.queue.task_queue import celery_app, check_broker_connection


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


async def test_celery_app_inspects_clean_status_against_the_live_broker() -> None:
    """The exact Task 11 specification's validation line: 'Celery app
    inspects clean status against Redis broker.'"""
    assert await check_broker_connection() is True


async def test_process_celery_app_connection_round_trips_against_live_redis() -> None:
    connection = celery_app.connection()
    try:
        connection.ensure_connection(max_retries=1, timeout=3)
        assert connection.connected
    finally:
        connection.release()
