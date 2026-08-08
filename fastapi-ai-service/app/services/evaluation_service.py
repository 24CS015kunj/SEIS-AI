"""AI Evaluation orchestration service.

Runs the offline/on-demand evaluation pipeline against the golden
dataset and produces scorecards (§5.14, §24).
"""

from app.config.settings import Settings, get_settings


class EvaluationService:
    """Orchestrates AI evaluation benchmark sweeps against golden datasets."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
