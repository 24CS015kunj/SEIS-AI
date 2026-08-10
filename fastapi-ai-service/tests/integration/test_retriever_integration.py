"""Integration test for app/core/retrieval/retriever.py (Task 19).

Requires both a real, reachable ChromaDB server (chromadb is not
installed in the native Windows venv, ADR-004) and a real
``NVIDIA_API_KEY`` (query embedding, ADR-007). Neither is available in
this environment/session, so this module is skipped here with an
explicit reason, not a fabricated pass.
"""

from __future__ import annotations

import uuid

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.retrieval.retriever import VectorRetriever
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata, Embedding
from app.infra.vectorstore.chroma_client import _CHROMADB_AVAILABLE, ChromaClient

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _CHROMADB_AVAILABLE or not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "Requires both chromadb (not installed in the native Windows venv, "
        "ADR-004) and a real NVIDIA_API_KEY -- neither is available in this "
        "environment. Run inside the Task 14 Linux/Docker environment with "
        "NVIDIA_API_KEY set to verify against live infrastructure."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


async def test_retrieve_returns_ranked_chunks_from_live_chromadb(settings: Settings) -> None:
    repository_id = f"itest-retriever-{uuid.uuid4().hex[:8]}"
    chroma = ChromaClient(settings=settings)
    embedder = NemotronEmbedder(settings=settings)

    chunk = Chunk(
        chunk_id="chunk-1",
        content="def authenticate(user, password):\n    return check_credentials(user, password)\n",
        metadata=ChunkMetadata(
            repository_id=repository_id,
            file_path="src/auth.py",
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            symbol_name="authenticate",
            start_line=1,
            end_line=2,
        ),
    )
    vector = (await embedder.embed_chunks([chunk]))[0]
    await chroma.upsert_chunks(
        repository_id, [chunk], [Embedding(chunk_id="chunk-1", vector=vector, model_version="v1")]
    )

    retriever = VectorRetriever(chroma_client=chroma, embedder=embedder)
    results = await retriever.retrieve("how does authentication work?", repository_id, top_k=5)

    assert len(results) >= 1
    assert results[0].chunk_id == "chunk-1"
    assert all(r.score >= 0.7 for r in results)

    await chroma.delete_collection(repository_id)
