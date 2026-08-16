"""Task Queue.

Async job queue abstraction decoupling slow repository-processing
workloads from latency-sensitive chat/search request handling
(§3.2 Execution Model).

Sole adapter to Celery (Task 11, ADR-005): the configured Celery
application instance lives here -- the rest of the application never
imports ``celery`` directly. ``celery_app`` is deliberately a
module-level attribute (not hidden inside a class): Celery's own CLI
discovers an application this way (``celery -A
app.infra.queue.task_queue worker``), and Task 40's future worker
process depends on that exact convention.

Scope (Task 11 only): this module configures the Celery *application*
-- broker/backend wiring, serialization, acknowledgement policy, and
queue routing. It defines zero ``@celery_app.task``-decorated
functions; the actual task bodies (repository processing, evolution
analysis) belong to the Core/Service layers built in later phases and
get registered against this same app object then, not here. ``task_routes``
below routes by task-*name* pattern, which works before any task
matching that pattern exists.

Async/sync boundary: like ChromaDB's client (Task 9) and unlike Redis's
(Task 10), Celery's connection/broker layer (``kombu``) is
synchronous -- there is no ``celery.asyncio``. ``check_broker_connection``
dispatches its blocking socket check via ``asyncio.to_thread`` rather
than pretending a sync call is async, for the same reason Task 9's
ChromaDB calls are thread-dispatched.

No boot-time failure risk: building ``celery_app`` (below, at import
time) is pure in-memory object construction and configuration --
``Celery(...)`` and ``.conf.update(...)`` never open a socket. Unlike
``ChromaClient``/``RedisClient``'s deliberately lazy connection
construction (deferred to avoid a boot-time crash if the backing
service is down), there is nothing here to defer: the first real network
call only happens inside ``check_broker_connection`` or when a task is
actually enqueued/consumed (Task 40+).

Readiness: deliberately NOT registered with
``app.api.v1.health_routes.register_readiness_check`` -- the Task 11
specification's subtask list has no readiness item (unlike Tasks 9 and
10, which explicitly required one). ``check_broker_connection`` exists
to satisfy the specification's own validation line ("Celery app
inspects clean status against Redis broker") as a reusable, testable
helper; wiring it into ``/health/ready`` is left to whichever future
task actually needs Celery's liveness reflected there (Task 40 or
Phase 10).
"""

from __future__ import annotations

import asyncio

import structlog
from celery import Celery  # type: ignore[import-untyped]

from app.config.settings import Settings, get_settings

logger = structlog.get_logger("seis.infra.queue")

# Queue routing (Task 11 subtask 4): task *name* patterns, not task
# objects -- these match once Phase 3/5 register tasks under these
# name prefixes, keeping ingestion and evolution workloads on separate
# queues so a churn analysis backlog never starves repository ingestion
# (or vice versa). Anything not matching either pattern falls back to
# Celery's default "celery" queue.
_TASK_ROUTES: dict[str, dict[str, str]] = {
    "app.tasks.ingestion.*": {"queue": "ingestion"},
    "app.tasks.evolution.*": {"queue": "evolution"},
}


def build_celery_app(settings: Settings) -> Celery:
    """Constructs and configures a Celery application (Task 11 subtasks 1-4).

    A plain function of ``settings`` -- not a cached singleton itself
    -- so tests can build independent app instances against arbitrary
    settings without reloading this module. :data:`celery_app` below
    is the process-wide instance built from the real process
    :class:`Settings` singleton.
    """
    app = Celery("seis_workers")
    app.conf.update(
        broker_url=settings.task_queue_broker_url,
        # Single Redis instance backs both the broker and the result
        # store (ADR-005) -- reuses the same frozen connection string
        # rather than inventing a second env var for the result backend.
        result_backend=settings.task_queue_broker_url,
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        # Late ack: a task is only acknowledged (removed from the
        # broker) once it *finishes*, not the moment a worker picks it
        # up -- a worker crash mid-task re-queues the job for another
        # worker instead of silently losing it (§Best Practices).
        task_acks_late=True,
        # Paired with late ack: a worker reserves only one unacked task
        # at a time rather than greedily prefetching a batch, so a
        # crash never strands multiple in-flight jobs at once.
        worker_prefetch_multiplier=1,
        task_routes=_TASK_ROUTES,
    )
    return app


# Process-wide instance (see module docstring for why this is a
# module-level singleton rather than a class instance built by a DI
# provider).
celery_app: Celery = build_celery_app(get_settings())


async def check_broker_connection(app: Celery | None = None) -> bool:
    """Validation helper: can the app reach its configured broker right now?

    Never raises -- always returns a bool, consistent with
    :meth:`ChromaClient.health_check`/:meth:`RedisClient.health_check`
    (Tasks 9-10), even though this one is not wired into
    ``/health/ready`` (see module docstring).

    Defaults to the process-wide :data:`celery_app`; accepts an
    explicit ``app`` so tests can exercise both the success and
    failure paths against a real (if unreachable) broker URL built via
    :func:`build_celery_app`, without mocking the connection layer.
    """
    target = app if app is not None else celery_app

    def _check() -> bool:
        connection = target.connection()
        try:
            connection.ensure_connection(max_retries=1, timeout=3)
            return True
        finally:
            connection.release()

    try:
        return await asyncio.to_thread(_check)
    except Exception as exc:
        logger.warning("queue.broker_connection_failed", error=str(exc))
        return False
