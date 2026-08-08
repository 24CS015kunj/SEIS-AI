"""Software Evolution Analysis orchestration service.

Coordinates Commit Analyzer -> Churn Calculator -> Trend Detector into
a persisted, retrievable evolution report (§5.2, §7).
"""

from app.config.settings import Settings, get_settings


class EvolutionAnalysisService:
    """Orchestrates commit history mining, churn calculation, and evolution reports."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
