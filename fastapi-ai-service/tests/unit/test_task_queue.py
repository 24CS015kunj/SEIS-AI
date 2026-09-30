"""Unit tests for app/infra/queue/task_queue.py (Task 11 / Task T5).

In Architecture E, Celery has been superseded by in-process background job
management (app.services.job_manager). This module tests task queue settings
and queue constants.
"""

from __future__ import annotations

from app.config.settings import Settings
from app.infra.queue.task_queue import (
    EVOLUTION_QUEUE_NAME,
    INGESTION_QUEUE_NAME,
    get_queue_settings,
)


def _settings(broker_url: str = "redis://localhost:6379/0") -> Settings:
    return Settings(task_queue_broker_url=broker_url)


def test_queue_constants() -> None:
    assert INGESTION_QUEUE_NAME == "ingestion"
    assert EVOLUTION_QUEUE_NAME == "evolution"


def test_get_queue_settings_defaults() -> None:
    settings = get_queue_settings()
    assert isinstance(settings, Settings)


def test_get_queue_settings_custom() -> None:
    custom = _settings("redis://custom-broker:6379/1")
    resolved = get_queue_settings(custom)
    assert resolved.task_queue_broker_url == "redis://custom-broker:6379/1"

