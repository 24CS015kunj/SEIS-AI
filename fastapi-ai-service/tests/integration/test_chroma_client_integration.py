"""Integration test for app/infra/vectorstore/chroma_client.py (Task 9).

Requires a real, reachable ChromaDB server (``CHROMA_HOST``/``CHROMA_PORT``)
and the ``chromadb`` package installed -- neither is true in the native
Windows development environment by design (see
requirements-vectorstore.txt, ADR-004). This test is auto-skipped there
and is intended to run inside the Task 14 Linux/Docker environment,
where ``chromadb`` is installed and a Chroma service container is
reachable at the configured host/port.

Locally (Windows, this session): SKIPPED -- verified only that the skip
condition itself triggers correctly (chromadb import genuinely absent).
Not yet executed against a live ChromaDB server.
"""

from __future__ import annotations

import uuid

import pytest

from app.config.settings import Settings, get_settings
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata, Embedding
from app.infra.vectorstore.chroma_client import _CHROMADB_AVAILABLE, ChromaClient

pytestmark = pytest.mark.skipif(
    not _CHROMADB_AVAILABLE,
    reason=(
        "chromadb is intentionally not installed in the native Windows venv "
        "(requirements-vectorstore.txt / ADR-004). Run inside the Task 14 "
        "Linux/Docker environment against a live ChromaDB container."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


async def test_full_write_query_delete_cycle_against_live_chromadb(settings: Settings) -> None:
    client = ChromaClient(settings=settings)
    repository_id = f"itest-{uuid.uuid4().hex[:8]}"

    assert await client.health_check() is True

    chunk = Chunk(
        chunk_id="chunk-1",
        content="def add(a, b): return a + b",
        metadata=ChunkMetadata(
            repository_id=repository_id,
            file_path="src/math.py",
            language="python",
            commit_sha="deadbeef",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            symbol_name="add",
            start_line=1,
            end_line=2,
        ),
    )
    embedding = Embedding(chunk_id="chunk-1", vector=[0.1] * 8, model_version="v1")

    try:
        await client.upsert_chunks(repository_id, [chunk], [embedding])

        fetched = await client.get_chunks(repository_id, ["chunk-1"])
        assert len(fetched) == 1
        assert fetched[0].chunk_id == "chunk-1"

        results = await client.query_similarity(repository_id, embedding.vector, top_k=1)
        assert len(results) == 1
        assert results[0].chunk_id == "chunk-1"

        await client.delete_chunks(repository_id, ["chunk-1"])
        assert await client.get_chunks(repository_id, ["chunk-1"]) == []
    finally:
        await client.delete_collection(repository_id)
        await client.close()
