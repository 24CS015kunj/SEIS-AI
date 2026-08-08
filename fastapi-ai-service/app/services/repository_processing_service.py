"""Repository Processing Engine orchestration service.

Coordinates Document Processor -> Chunker -> Embedder -> ChromaDB
Client and drives ProcessingStatus transitions (§5.1, §6, §22).
"""

from app.config.settings import Settings, get_settings


class RepositoryProcessingService:
    """Orchestrates repository ingestion, document processing, and chunking."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
