"""Task Queue abstraction (superseded by Task T5, Architecture E).

Celery and its distributed broker architecture have been replaced by the
in-process managed IngestionJobManager (app.services.job_manager).
This module retains lightweight queue definitions without Celery runtime dependencies.
"""

from __future__ import annotations

import structlog

from app.config.settings import Settings, get_settings

logger = structlog.get_logger("seis.infra.queue")

INGESTION_QUEUE_NAME = "ingestion"
EVOLUTION_QUEUE_NAME = "evolution"


def get_queue_settings(settings: Settings | None = None) -> Settings:
    """Returns application settings for queue and cache."""
    return settings or get_settings()
