"""Opt-in acceptance against the intended managed cluster and actual NVIDIA embeddings.

RUN_QDRANT_CLOUD_TESTS=1 opts in. Credentials are read from the ignored service
environment. Only random t8-itest repository collections are written/deleted.
"""

import os
import uuid
from collections.abc import AsyncGenerator

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata, Embedding
from app.infra.vectorstore.qdrant_client import QdrantVectorClient

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_QDRANT_CLOUD_TESTS") != "1",
    reason="Opt in with RUN_QDRANT_CLOUD_TESTS=1 after configuring the managed endpoint/key",
)


@pytest.fixture
def settings() -> Settings:
    configured = get_settings()
    assert (
        configured.qdrant_url and configured.qdrant_api_key.get_secret_value()
    ), "Configure QDRANT_URL and QDRANT_API_KEY securely before cloud acceptance"
    assert configured.embedding_dimension == 2048
    return configured.model_copy(update={"vector_store_backend": "qdrant"})


@pytest.fixture
async def cloud(settings: Settings) -> AsyncGenerator[tuple[QdrantVectorClient, str, str]]:
    run = uuid.uuid4().hex
    repo_a, repo_b = f"t8-itest-{run}-A", f"t8-itest-{run}-B"
    adapter = QdrantVectorClient(settings)
    try:
        assert await adapter.health_check(), "Qdrant Cloud did not become ready"
        yield adapter, repo_a, repo_b
    finally:
        try:
            # Exact unique fixture repositories only, never an account-wide reset.
            await adapter.delete_collection(repo_a)
            await adapter.delete_collection(repo_b)
        finally:
            await adapter.close()


def _chunk(repo: str, chunk_id: str, path: str = "public_fixture.py") -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content="def public_fixture(): return 42",
        metadata=ChunkMetadata(
            repository_id=repo,
            file_path=path,
            language="python",
            commit_sha="public-fixture-sha",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=1,
        ),
    )


async def test_real_2048_nvidia_embedding_cloud_round_trip_and_fresh_client_idempotency(
    cloud: tuple[QdrantVectorClient, str, str],
    settings: Settings,
) -> None:
    adapter, repo, _ = cloud
    assert (
        settings.nvidia_embedding_api_key.get_secret_value()
    ), "Actual NVIDIA embedding acceptance requires the existing embedding API key"
    embedder = NemotronEmbedder(settings)
    try:
        vector = await embedder.embed_query("Public test fixture: a Python function returning 42")
    finally:
        await embedder.close()
    assert len(vector) == 2048
    chunk = _chunk(repo, "stable-domain-chunk-id")
    embedding = Embedding(chunk_id=chunk.chunk_id, vector=vector, model_version="v1")
    await adapter.upsert_chunks(repo, [chunk], [embedding])
    results = await adapter.query_similarity(
        repo, vector, top_k=5, metadata_filter={"document_type": "source_code"}
    )
    assert results[0].chunk_id == chunk.chunk_id
    assert results[0].score > 0.99
    assert (await adapter.get_chunks(repo, [chunk.chunk_id]))[0].content == chunk.content
    fresh = QdrantVectorClient(settings)
    try:
        # Fresh SDK connection, no local prepared-collection cache, same persisted point.
        await fresh.upsert_chunks(repo, [chunk], [embedding])
        await fresh.upsert_chunks(repo, [chunk], [embedding])
        assert (
            await fresh._get_client().count(fresh._collection_name(repo), exact=True)
        ).count == 1
        assert (await fresh.query_similarity(repo, vector, 1))[0].chunk_id == chunk.chunk_id
    finally:
        await fresh.close()
    print(
        "T8 managed NVIDIA 2048-dimension round-trip and fresh-client duplicate-free retry passed"
    )


async def test_cloud_strict_indexes_isolation_filters_and_deletion(
    cloud: tuple[QdrantVectorClient, str, str],
) -> None:
    adapter, repo_a, repo_b = cloud
    vector = [1.0] + [0.0] * 2047
    chunks = [
        _chunk(repo_a, "same-id"),
        _chunk(repo_a, "other-id", "other.py"),
        _chunk(repo_b, "same-id"),
    ]
    for chunk in chunks:
        await adapter.upsert_chunks(
            chunk.metadata.repository_id,
            [chunk],
            [
                Embedding(
                    chunk_id=chunk.chunk_id,
                    vector=vector,
                    model_version="v1",
                )
            ],
        )
    results = await adapter.query_similarity(
        repo_a,
        vector,
        5,
        {
            "file_path": "public_fixture.py",
            "commit_sha": "public-fixture-sha",
        },
    )
    assert [result.chunk_id for result in results] == ["same-id"]
    assert all(result.metadata.repository_id == repo_a for result in results)
    info = await adapter._get_client().get_collection(adapter._collection_name(repo_a))
    assert {"file_path", "document_type", "commit_sha"}.issubset(info.payload_schema)
    await adapter.delete_chunks_by_metadata(repo_a, {"file_path": "public_fixture.py"})
    assert [chunk.chunk_id for chunk in await adapter.get_all_chunks(repo_a)] == ["other-id"]
    assert [chunk.chunk_id for chunk in await adapter.get_all_chunks(repo_b)] == ["same-id"]
    await adapter.delete_chunks(repo_a, ["other-id"])
    assert await adapter.get_all_chunks(repo_a) == []
    print("T8 cloud strict-mode indexes, repository isolation and exact deletion passed")
