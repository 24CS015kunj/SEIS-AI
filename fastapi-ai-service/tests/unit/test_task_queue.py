"""Unit tests for app/infra/queue/task_queue.py (Task 11).

These tests exercise the Celery application's actual configuration and
routing behavior -- not merely that `build_celery_app` returns *some*
object. The unreachable-broker case uses a real (but bogus) broker URL
rather than a mock, so the failure path is genuine connection-refused
behavior, not a simulated one. Live-broker verification against a real
Docker Redis container is covered separately by
tests/integration/test_task_queue_integration.py.
"""

from __future__ import annotations

from app.config.settings import Settings
from app.infra.queue.task_queue import build_celery_app, celery_app, check_broker_connection


def _settings(broker_url: str = "redis://localhost:6379/0") -> Settings:
    return Settings(task_queue_broker_url=broker_url)


# ---------------------------------------------------------------------------
# App construction / configuration usage
# ---------------------------------------------------------------------------
def test_build_celery_app_sets_the_expected_main_name() -> None:
    app = build_celery_app(_settings())
    assert app.main == "seis_workers"


def test_build_celery_app_uses_broker_and_result_backend_from_settings() -> None:
    app = build_celery_app(_settings("redis://example-host:6380/3"))
    assert app.conf.broker_url == "redis://example-host:6380/3"
    assert app.conf.result_backend == "redis://example-host:6380/3"


def test_build_celery_app_uses_json_serialization() -> None:
    app = build_celery_app(_settings())
    assert app.conf.task_serializer == "json"
    assert app.conf.accept_content == ["json"]
    assert app.conf.result_serializer == "json"


def test_build_celery_app_uses_late_ack_and_single_prefetch() -> None:
    app = build_celery_app(_settings())
    assert app.conf.task_acks_late is True
    assert app.conf.worker_prefetch_multiplier == 1


def test_build_celery_app_calls_are_independent_of_each_other() -> None:
    """Two apps built from different settings must not share mutable
    config state -- a regression here would mean one caller's broker URL
    silently leaks into another's app instance."""
    first = build_celery_app(_settings("redis://host-a:6379/0"))
    second = build_celery_app(_settings("redis://host-b:6379/1"))

    assert first.conf.broker_url == "redis://host-a:6379/0"
    assert second.conf.broker_url == "redis://host-b:6379/1"


def test_process_singleton_matches_the_process_settings_broker_url() -> None:
    assert celery_app.conf.broker_url == _settings().task_queue_broker_url


# ---------------------------------------------------------------------------
# Task routing (Task 11 subtask 4)
# ---------------------------------------------------------------------------
def test_ingestion_task_names_route_to_the_ingestion_queue() -> None:
    app = build_celery_app(_settings())
    route = app.amqp.router.route({}, "app.tasks.ingestion.process_repository")
    assert route["queue"].name == "ingestion"


def test_evolution_task_names_route_to_the_evolution_queue() -> None:
    app = build_celery_app(_settings())
    route = app.amqp.router.route({}, "app.tasks.evolution.churn_report")
    assert route["queue"].name == "evolution"


def test_unmatched_task_names_fall_back_to_the_default_queue() -> None:
    """A task name that doesn't match either prefix must not accidentally
    land on `ingestion` or `evolution` -- proving the routing patterns are
    prefix-scoped, not overly broad."""
    app = build_celery_app(_settings())
    route = app.amqp.router.route({}, "app.tasks.something_else.do_thing")
    assert route["queue"].name == "celery"  # Celery's built-in default queue name


# ---------------------------------------------------------------------------
# Broker connectivity check
# ---------------------------------------------------------------------------
async def test_check_broker_connection_false_against_an_unreachable_broker() -> None:
    """A real (bogus) broker URL that nothing is listening on -- genuine
    connection-refused behavior, not a mocked exception."""
    unreachable_app = build_celery_app(_settings("redis://localhost:59999/0"))
    assert await check_broker_connection(unreachable_app) is False


async def test_check_broker_connection_never_raises_on_malformed_url() -> None:
    malformed_app = build_celery_app(_settings("not-a-valid-broker-url"))
    assert await check_broker_connection(malformed_app) is False
