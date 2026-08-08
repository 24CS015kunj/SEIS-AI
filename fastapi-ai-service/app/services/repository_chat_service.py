"""Repository Chat orchestration service.

Coordinates Retriever -> RAG Optimizer -> Context Builder -> Prompt
Builder -> Gemini Gateway for a single chat turn (§5.11, §10).
"""

from app.config.settings import Settings, get_settings


class RepositoryChatService:
    """Orchestrates grounded retrieval-augmented chat generation."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
