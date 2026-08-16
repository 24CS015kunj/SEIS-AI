"""Integration test for app/core/processing/synchronizer.py (Task 18).

Requires both a real, reachable ChromaDB server (chromadb is not
installed in the native Windows venv, see ADR-004/Task 9) and a real
``NVIDIA_API_KEY`` (embedding provider, ADR-007) -- the full pipeline
this task orchestrates touches both. Neither is available in this
environment/session, so this module is skipped here with an explicit
reason, not a fabricated pass. Written to run for real inside the Task
14 Linux/Docker environment once both are configured.
"""

from __future__ import annotations

import uuid

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.core.processing.synchronizer import IncrementalSynchronizer
from app.domain.models import DiffManifest, ManifestFile
from app.infra.cache.cache_client import RedisClient
from app.infra.vectorstore.chroma_client import _CHROMADB_AVAILABLE, ChromaClient

_EMBEDDING_DIMENSION = 2048

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _CHROMADB_AVAILABLE or not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "Requires both chromadb (not installed in the native Windows venv, "
        "ADR-004) and a real NVIDIA_API_KEY (ADR-007) -- neither is "
        "available in this environment. Run inside the Task 14 Linux/Docker "
        "environment with NVIDIA_API_KEY set to verify against live "
        "infrastructure."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def synchronizer(settings: Settings) -> IncrementalSynchronizer:
    return IncrementalSynchronizer(
        chroma_client=ChromaClient(settings=settings),
        document_processor=DocumentProcessor(),
        chunker=ASTChunker(),
        metadata_generator=MetadataGenerator(),
        embedder=NemotronEmbedder(settings=settings),
        embedding_cache=EmbeddingCache(
            redis_client=RedisClient(settings=settings), settings=settings
        ),
    )


async def test_modifying_one_file_updates_only_that_files_vectors_live(
    synchronizer: IncrementalSynchronizer, settings: Settings
) -> None:
    repository_id = f"itest-sync-{uuid.uuid4().hex[:8]}"
    chroma = ChromaClient(settings=settings)

    initial = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-1",
        added_files=[
            ManifestFile(path="a.py", content=b"def a():\n    return 1\n", size_bytes=20),
            ManifestFile(path="b.py", content=b"def b():\n    return 2\n", size_bytes=20),
        ],
    )
    await synchronizer.process_diff(repository_id, initial)

    a_before = await chroma.query_similarity(
        repository_id, [0.0] * _EMBEDDING_DIMENSION, top_k=10, metadata_filter={"file_path": "a.py"}
    )
    b_before = await chroma.query_similarity(
        repository_id, [0.0] * _EMBEDDING_DIMENSION, top_k=10, metadata_filter={"file_path": "b.py"}
    )
    assert len(a_before) >= 1
    assert len(b_before) >= 1

    update = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-2",
        modified_files=[
            ManifestFile(path="a.py", content=b"def a():\n    return 999\n", size_bytes=24)
        ],
    )
    await synchronizer.process_diff(repository_id, update)

    a_after = await chroma.query_similarity(
        repository_id, [0.0] * _EMBEDDING_DIMENSION, top_k=10, metadata_filter={"file_path": "a.py"}
    )
    b_after = await chroma.query_similarity(
        repository_id, [0.0] * _EMBEDDING_DIMENSION, top_k=10, metadata_filter={"file_path": "b.py"}
    )
    assert any("999" in item.content for item in a_after)
    assert [item.chunk_id for item in b_after] == [item.chunk_id for item in b_before]

    await chroma.delete_collection(repository_id)
