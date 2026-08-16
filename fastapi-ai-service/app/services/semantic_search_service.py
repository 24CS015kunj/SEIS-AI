"""Semantic Search orchestration service.

Coordinates the Retriever (and optional reranking) for direct,
generation-free repository search (§5.12).
"""

from app.config.settings import Settings, get_settings


class SemanticSearchService:
    """Orchestrates direct semantic snippet search without LLM generation."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
