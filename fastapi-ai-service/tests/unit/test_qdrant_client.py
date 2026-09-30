"""Qdrant contract tests against the SDK's real local engine, without Docker/cloud.

These verify filters, cosine ordering, stable IDs, pagination and restart writes.
Cloud strict-mode/index/network acceptance is tested separately.
"""

import asyncio
from collections.abc import AsyncGenerator
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import SecretStr
from qdrant_client import AsyncQdrantClient, models

from app.config.settings import Settings
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.retriever import VectorRetriever
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import VectorDBError
from app.domain.models import Chunk, ChunkMetadata, Embedding
from app.infra.vectorstore.client import create_vector_store
from app.infra.vectorstore.qdrant_client import QdrantVectorClient


def _chunk(repo: str, chunk_id: str, path: str = "src/example.py", sha: str = "sha-1") -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content="def example_function(): return 42",
        metadata=ChunkMetadata(
            repository_id=repo,
            file_path=path,
            language="python",
            commit_sha=sha,
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=1,
            symbol_name="example_function",
        ),
    )


def _embedding(chunk: Chunk, vector: list[float] | None = None) -> Embedding:
    return Embedding(
        chunk_id=chunk.chunk_id, vector=vector or [1.0, 0.0, 0.0, 0.0], model_version="v1"
    )


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        vector_store_backend="qdrant",
        embedding_dimension=4,
        qdrant_url="https://fixture.invalid",
        qdrant_api_key=SecretStr("fixture-key"),
    )


@pytest.fixture
async def store() -> AsyncGenerator[QdrantVectorClient]:
    adapter = QdrantVectorClient(_settings())
    adapter._client = AsyncQdrantClient(":memory:")
    adapter._created_loop = asyncio.get_running_loop()
    try:
        yield adapter
    finally:
        await adapter.close()


async def test_idempotency_domain_ids_scores_and_repository_isolation(
    store: QdrantVectorClient,
) -> None:
    chunk_a, chunk_b = _chunk("repo-A", "same:domain:id"), _chunk("repo-B", "same:domain:id")
    await store.upsert_chunks("repo-A", [chunk_a], [_embedding(chunk_a)])
    await store.upsert_chunks("repo-A", [chunk_a], [_embedding(chunk_a)])
    await store.upsert_chunks("repo-B", [chunk_b], [_embedding(chunk_b, [-1.0, 0.0, 0.0, 0.0])])
    sdk = store._get_client()
    assert (await sdk.count("repo_repo-A", exact=True)).count == 1
    found = await store.query_similarity("repo-A", [1.0, 0.0, 0.0, 0.0], 5)
    assert found[0].chunk_id == "same:domain:id"
    assert found[0].score == pytest.approx(1.0)
    assert found[0].metadata.repository_id == "repo-A"
    assert (await store.query_similarity("repo-B", [1.0, 0.0, 0.0, 0.0], 5))[0].score == 0.0
    assert (await store.get_chunks("repo-A", [chunk_a.chunk_id]))[0].content == chunk_a.content
    assert await store.query_similarity("repo-empty", [1.0, 0.0, 0.0, 0.0], 5) == []
    assert not await sdk.collection_exists("repo_repo-empty")


async def test_filtered_search_delete_and_empty_filter_guard(store: QdrantVectorClient) -> None:
    chunks = [
        _chunk("repo-A", "one", sha="sha-1"),
        _chunk("repo-A", "two", sha="sha-2"),
        _chunk("repo-A", "three", path="src/other.py", sha="sha-1"),
    ]
    await store.upsert_chunks("repo-A", chunks, [_embedding(chunk) for chunk in chunks])
    result = await store.query_similarity(
        "repo-A", [1.0, 0.0, 0.0, 0.0], 5, {"file_path": "src/example.py", "commit_sha": "sha-1"}
    )
    assert [item.chunk_id for item in result] == ["one"]
    await store.delete_chunks_by_metadata(
        "repo-A", {"file_path": "src/example.py", "commit_sha": "sha-1"}
    )
    assert {chunk.chunk_id for chunk in await store.get_all_chunks("repo-A")} == {"two", "three"}
    with pytest.raises(VectorDBError, match="explicit metadata filter"):
        await store.delete_chunks_by_metadata("repo-A", {})
    await store.delete_chunks("repo-A", ["two"])
    assert [chunk.chunk_id for chunk in await store.get_all_chunks("repo-A")] == ["three"]
    await store.delete_collection("repo-A")
    assert await store.get_all_chunks("repo-A") == []


async def test_bounded_pagination_and_batched_writes(store: QdrantVectorClient) -> None:
    chunks = [_chunk("repo-A", f"chunk-{index}") for index in range(150)]
    await store.upsert_chunks("repo-A", chunks, [_embedding(chunk) for chunk in chunks])
    result = await store.get_all_chunks("repo-A", limit=130)
    assert len(result) == len({chunk.chunk_id for chunk in result}) == 130
    assert len(await store.get_all_chunks("repo-A")) == 150


@pytest.mark.parametrize(
    "vector", [[1.0], [0.0] * 4, [float("nan"), 0.0, 0.0, 0.0], [float("inf"), 0.0, 0.0, 0.0]]
)
async def test_invalid_vector_is_rejected_before_any_write(
    store: QdrantVectorClient, vector: list[float]
) -> None:
    chunk = _chunk("repo-A", "invalid")
    with pytest.raises(VectorDBError, match="Vector must"):
        await store.upsert_chunks(
            "repo-A",
            [chunk],
            [Embedding(chunk_id=chunk.chunk_id, vector=vector, model_version="v1")],
        )
    assert not await store._get_client().collection_exists("repo_repo-A")


async def test_mismatched_repository_and_collection_configuration_fail_closed(
    store: QdrantVectorClient,
) -> None:
    wrong = _chunk("repo-B", "wrong")
    with pytest.raises(VectorDBError, match="repository mismatch"):
        await store.upsert_chunks("repo-A", [wrong], [_embedding(wrong)])
    await store._get_client().create_collection(
        "repo_repo-A",
        vectors_config=models.VectorParams(
            size=2,
            distance=models.Distance.COSINE,
        ),
    )
    with pytest.raises(VectorDBError, match="incompatible vector configuration"):
        await store.get_or_create_collection("repo-A")
    with pytest.raises(VectorDBError, match="safe collection identifier"):
        await store.get_or_create_collection("../other-repo")


async def test_retry_after_acknowledged_write_has_no_duplicates(
    store: QdrantVectorClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunk = _chunk("repo-A", "retry-chunk")
    sdk = store._get_client()
    upsert = sdk.upsert
    calls = 0

    async def reply_lost(*args: object, **kwargs: object) -> object:
        nonlocal calls
        result = await upsert(*args, **kwargs)
        calls += 1
        if calls == 1:
            raise httpx.ReadTimeout("simulated lost reply after write")
        return result

    monkeypatch.setattr(sdk, "upsert", reply_lost)
    await store.upsert_chunks("repo-A", [chunk], [_embedding(chunk)])
    assert calls == 2
    assert (await sdk.count("repo_repo-A", exact=True)).count == 1


async def test_fresh_adapter_after_persisted_vector_write_is_idempotent(tmp_path: Path) -> None:
    chunk = _chunk("repo-A", "persisted-chunk")
    for _ in range(2):
        adapter = QdrantVectorClient(_settings())
        adapter._client = AsyncQdrantClient(path=str(tmp_path / "qdrant"))
        adapter._created_loop = asyncio.get_running_loop()
        try:
            await adapter.upsert_chunks("repo-A", [chunk], [_embedding(chunk)])
            assert (await adapter._get_client().count("repo_repo-A", exact=True)).count == 1
        finally:
            await adapter.close()


async def test_existing_semantic_and_lexical_retrievers_use_qdrant(
    store: QdrantVectorClient,
) -> None:
    chunk = _chunk("repo-A", "retrieved-id")
    await store.upsert_chunks("repo-A", [chunk], [_embedding(chunk)])
    embedder = AsyncMock()
    embedder.embed_query.return_value = [1.0, 0.0, 0.0, 0.0]
    semantic = VectorRetriever(chroma_client=store, embedder=embedder)
    dense = await semantic.retrieve("example_function", "repo-A", top_k=5, score_threshold=0.3)
    lexical = await LexicalRetriever(chroma_client=store).retrieve("example_function", "repo-A")
    assert dense[0].chunk_id == lexical[0].chunk_id == chunk.chunk_id
    assert await LexicalRetriever(chroma_client=store).retrieve("example_function", "repo-B") == []


def test_backend_selection_and_secure_configuration() -> None:
    assert isinstance(create_vector_store(_settings()), QdrantVectorClient)
    with pytest.raises(ValueError, match="QDRANT_URL"):
        Settings(_env_file=None, qdrant_url="http://fixture.invalid")
    with pytest.raises(ValueError) as exc:
        Settings(_env_file=None, qdrant_url="https://fixture-password@fixture.invalid")
    assert "fixture-password" not in str(exc.value)


async def test_missing_qdrant_configuration_is_unhealthy_without_fallback() -> None:
    store = QdrantVectorClient(
        Settings(
            _env_file=None,
            vector_store_backend="qdrant",
            qdrant_url="",
            qdrant_api_key=SecretStr(""),
        )
    )
    assert await store.health_check() is False
    with pytest.raises(VectorDBError, match="Configure QDRANT"):
        await store.get_or_create_collection("repo-A")
