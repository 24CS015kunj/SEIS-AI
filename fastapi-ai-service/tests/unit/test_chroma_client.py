"""Unit tests for app/infra/vectorstore/chroma_client.py (Task 9).

ChromaDB is intentionally not installed in the native Windows venv (see
requirements-vectorstore.txt / ADR-004) -- these tests exercise the
adapter's own logic (collection naming/isolation, metadata mapping,
distance-to-score conversion, retry, and error translation) against a
minimal in-memory fake standing in for the ``chromadb`` SDK, rather
than a real server. Live-server verification is a Task 14 Docker
requirement (see tests/integration/test_chroma_client_integration.py).
"""

from __future__ import annotations

import types
from datetime import UTC, datetime
from typing import Any

import pytest

import app.infra.vectorstore.chroma_client as chroma_client_module
from app.config.settings import Settings
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import VectorDBError
from app.domain.models import Chunk, ChunkMetadata, Embedding
from app.infra.vectorstore.chroma_client import ChromaClient

# NOTE: no module-level `pytestmark = pytest.mark.asyncio` here -- pyproject's
# `asyncio_mode = "auto"` (Task 1) already treats every `async def test_*`
# as an asyncio test; adding the marker explicitly would incorrectly apply
# it to this file's synchronous tests too (e.g. the collection-naming ones).


# ---------------------------------------------------------------------------
# Fakes standing in for the chromadb SDK surface this adapter touches.
# ---------------------------------------------------------------------------
def _matches_where(metadata: dict[str, Any], where: dict[str, Any]) -> bool:
    if "$and" in where:
        return all(_matches_where(metadata, clause) for clause in where["$and"])
    return all(metadata.get(key) == value for key, value in where.items())


class FakeCollection:
    def __init__(self, name: str) -> None:
        self.name = name
        self.upsert_calls: list[dict[str, Any]] = []
        self.query_calls: list[dict[str, Any]] = []
        self.get_calls: list[dict[str, Any]] = []
        self.delete_calls: list[dict[str, Any]] = []
        self.next_query_result: dict[str, Any] | None = None
        self.upsert_fail_times = 0
        self._store: dict[str, tuple[str, dict[str, Any]]] = {}

    def upsert(
        self,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict[str, Any]],
    ) -> None:
        self.upsert_calls.append(
            {"ids": ids, "embeddings": embeddings, "documents": documents, "metadatas": metadatas}
        )
        if self.upsert_fail_times > 0:
            self.upsert_fail_times -= 1
            raise ConnectionError("simulated transient connection failure")
        for chunk_id, doc, meta in zip(ids, documents, metadatas, strict=True):
            self._store[chunk_id] = (doc, meta)

    def query(
        self, query_embeddings: list[list[float]], n_results: int, where: dict[str, Any] | None
    ) -> dict[str, Any]:
        self.query_calls.append(
            {"query_embeddings": query_embeddings, "n_results": n_results, "where": where}
        )
        if self.next_query_result is not None:
            return self.next_query_result
        return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

    def get(self, ids: list[str], include: list[str]) -> dict[str, Any]:
        self.get_calls.append({"ids": ids, "include": include})
        found_ids: list[str] = []
        docs: list[str] = []
        metas: list[dict[str, Any]] = []
        for chunk_id in ids:
            if chunk_id in self._store:
                found_ids.append(chunk_id)
                doc, meta = self._store[chunk_id]
                docs.append(doc)
                metas.append(meta)
        return {"ids": found_ids, "documents": docs, "metadatas": metas}

    def delete(self, ids: list[str] | None = None, where: dict[str, Any] | None = None) -> None:
        self.delete_calls.append({"ids": ids, "where": where})
        if ids is not None:
            for chunk_id in ids:
                self._store.pop(chunk_id, None)
            return
        if where is None:
            return
        for chunk_id in [
            cid for cid, (_, meta) in self._store.items() if _matches_where(meta, where)
        ]:
            self._store.pop(chunk_id, None)


class FakeChromaSDKClient:
    def __init__(self, host: str | None = None, port: int | None = None) -> None:
        self.host = host
        self.port = port
        self.collections: dict[str, FakeCollection] = {}
        self.get_or_create_calls: list[dict[str, Any]] = []
        self.delete_collection_calls: list[str] = []
        self.heartbeat_error: Exception | None = None
        self.closed = False

    def close(self) -> None:
        self.closed = True

    def get_or_create_collection(
        self, name: str, metadata: dict[str, Any] | None = None
    ) -> FakeCollection:
        self.get_or_create_calls.append({"name": name, "metadata": metadata})
        if name not in self.collections:
            self.collections[name] = FakeCollection(name)
        return self.collections[name]

    def delete_collection(self, name: str) -> None:
        self.delete_collection_calls.append(name)
        self.collections.pop(name, None)

    def heartbeat(self) -> int:
        if self.heartbeat_error is not None:
            raise self.heartbeat_error
        return 1_234_567_890


@pytest.fixture
def fake_chromadb(monkeypatch: pytest.MonkeyPatch) -> dict[str, FakeChromaSDKClient]:
    holder: dict[str, FakeChromaSDKClient] = {}

    def _http_client_factory(
        host: str | None = None, port: int | None = None
    ) -> FakeChromaSDKClient:
        sdk_client = FakeChromaSDKClient(host=host, port=port)
        holder["client"] = sdk_client
        return sdk_client

    fake_module = types.SimpleNamespace(HttpClient=_http_client_factory)
    monkeypatch.setattr(chroma_client_module, "chromadb", fake_module)
    monkeypatch.setattr(chroma_client_module, "_CHROMADB_AVAILABLE", True)
    return holder


def _make_chunk(chunk_id: str = "chunk-1", repository_id: str = "repo-1") -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content="def foo(): return 1",
        metadata=ChunkMetadata(
            repository_id=repository_id,
            file_path="src/foo.py",
            language="python",
            commit_sha="abc123",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            symbol_name="foo",
            start_line=1,
            end_line=2,
        ),
    )


def _make_embedding(chunk_id: str = "chunk-1") -> Embedding:
    return Embedding(chunk_id=chunk_id, vector=[0.1, 0.2, 0.3], model_version="v1")


# ---------------------------------------------------------------------------
# Collection naming / repository isolation boundary
# ---------------------------------------------------------------------------
def test_collection_name_uses_repo_prefix() -> None:
    assert ChromaClient._collection_name("abc-123") == "repo_abc-123"


def test_collection_name_rejects_empty_repository_id() -> None:
    with pytest.raises(VectorDBError):
        ChromaClient._collection_name("")


def test_collection_name_rejects_blank_repository_id() -> None:
    with pytest.raises(VectorDBError):
        ChromaClient._collection_name("   ")


async def test_upsert_and_get_are_scoped_to_the_owning_repository_collection(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    """Writing a chunk into repo "alpha" must never be visible when reading
    the same chunk_id back from repo "beta" -- this is the isolation
    guarantee ADR-004 calls a security property, not a performance one."""
    client = ChromaClient(settings=Settings())

    await client.upsert_chunks(
        "alpha", [_make_chunk("shared-id", "alpha")], [_make_embedding("shared-id")]
    )

    same_repo = await client.get_chunks("alpha", ["shared-id"])
    other_repo = await client.get_chunks("beta", ["shared-id"])

    assert len(same_repo) == 1
    assert same_repo[0].chunk_id == "shared-id"
    assert other_repo == []

    sdk_client = fake_chromadb["client"]
    collection_names = {call["name"] for call in sdk_client.get_or_create_calls}
    assert collection_names == {"repo_alpha", "repo_beta"}


async def test_upsert_configures_cosine_space_on_collection_creation(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])

    sdk_client = fake_chromadb["client"]
    assert sdk_client.get_or_create_calls[0]["metadata"] == {"hnsw:space": "cosine"}


# ---------------------------------------------------------------------------
# upsert_chunks behavior
# ---------------------------------------------------------------------------
async def test_upsert_chunks_missing_embedding_raises_vectordberror(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    with pytest.raises(VectorDBError, match="Missing embeddings"):
        await client.upsert_chunks("repo-x", [_make_chunk("no-embedding")], [])


async def test_upsert_chunks_stamps_indexed_at_and_embedding_version(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    before = datetime.now(UTC)

    await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])

    collection = fake_chromadb["client"].collections["repo_repo-x"]
    metadata = collection.upsert_calls[0]["metadatas"][0]
    assert metadata["embedding_model_version"] == "v1"
    assert datetime.fromisoformat(metadata["indexed_at"]) >= before


async def test_upsert_chunks_empty_list_is_a_noop(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.upsert_chunks("repo-x", [], [])
    assert "client" not in fake_chromadb  # never even constructed the SDK client


# ---------------------------------------------------------------------------
# query_similarity: distance -> score conversion, metadata round-trip
# ---------------------------------------------------------------------------
async def test_query_similarity_converts_distance_to_bounded_score(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    collection = fake_chromadb["client"].collections["repo_repo-x"]
    raw_metadata = {
        "repository_id": "repo-x",
        "file_path": "src/foo.py",
        "language": "python",
        "commit_sha": "abc123",
        "chunk_type": "code_function",
        "document_type": "source_code",
        "start_line": 1,
        "end_line": 2,
    }
    collection.next_query_result = {
        "ids": [["chunk-a", "chunk-b", "chunk-c"]],
        "documents": [["content-a", "content-b", "content-c"]],
        "metadatas": [[raw_metadata, raw_metadata, raw_metadata]],
        # 0.2 -> 0.8 (normal); -0.5 -> clamped to 1.0; 1.5 -> clamped to 0.0
        "distances": [[0.2, -0.5, 1.5]],
    }

    results = await client.query_similarity("repo-x", [0.1, 0.2, 0.3], top_k=3)

    assert [round(r.score, 5) for r in results] == [0.8, 1.0, 0.0]
    assert results[0].metadata.chunk_type is ChunkType.CODE_FUNCTION
    assert results[0].metadata.document_type is DocumentType.SOURCE_CODE


async def test_query_similarity_builds_single_key_where_clause(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.query_similarity("repo-x", [0.1], top_k=5, metadata_filter={"language": "python"})

    collection = fake_chromadb["client"].collections["repo_repo-x"]
    assert collection.query_calls[0]["where"] == {"language": "python"}


async def test_query_similarity_builds_and_where_clause_for_multiple_filters(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.query_similarity(
        "repo-x", [0.1], top_k=5, metadata_filter={"language": "python", "file_path": "src/foo.py"}
    )

    collection = fake_chromadb["client"].collections["repo_repo-x"]
    where = collection.query_calls[0]["where"]
    assert where is not None
    assert "$and" in where
    assert {"language": "python"} in where["$and"]
    assert {"file_path": "src/foo.py"} in where["$and"]


# ---------------------------------------------------------------------------
# delete_chunks / delete_collection
# ---------------------------------------------------------------------------
async def test_delete_chunks_removes_only_targeted_ids(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.upsert_chunks(
        "repo-x",
        [_make_chunk("keep"), _make_chunk("drop")],
        [_make_embedding("keep"), _make_embedding("drop")],
    )

    await client.delete_chunks("repo-x", ["drop"])

    remaining = await client.get_chunks("repo-x", ["keep", "drop"])
    assert [c.chunk_id for c in remaining] == ["keep"]


async def test_delete_chunks_by_metadata_removes_only_matching_file_path(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    """Task 18's synchronizer needs this: delete every chunk for one
    file_path without knowing their (commit-sha-derived) ids ahead of
    time."""
    client = ChromaClient(settings=Settings())
    keep = _make_chunk("keep")
    drop_a = Chunk(
        chunk_id="drop-a",
        content="def bar(): ...",
        metadata=ChunkMetadata(
            repository_id="repo-x",
            file_path="src/bar.py",
            language="python",
            commit_sha="abc123",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )
    drop_b = Chunk(
        chunk_id="drop-b",
        content="def bar2(): ...",
        metadata=ChunkMetadata(
            repository_id="repo-x",
            file_path="src/bar.py",
            language="python",
            commit_sha="abc123",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=4,
            end_line=5,
        ),
    )
    await client.upsert_chunks(
        "repo-x",
        [keep, drop_a, drop_b],
        [_make_embedding("keep"), _make_embedding("drop-a"), _make_embedding("drop-b")],
    )

    await client.delete_chunks_by_metadata("repo-x", {"file_path": "src/bar.py"})

    remaining = await client.get_chunks("repo-x", ["keep", "drop-a", "drop-b"])
    assert [c.chunk_id for c in remaining] == ["keep"]


async def test_delete_collection_drops_the_whole_collection(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    assert "repo_repo-x" in fake_chromadb["client"].collections

    await client.delete_collection("repo-x")

    assert "repo_repo-x" not in fake_chromadb["client"].collections
    assert fake_chromadb["client"].delete_collection_calls == ["repo_repo-x"]


# ---------------------------------------------------------------------------
# Error translation + retry
# ---------------------------------------------------------------------------
async def test_transient_failure_retries_then_succeeds(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    collection = fake_chromadb["client"].collections["repo_repo-x"]
    collection.upsert_fail_times = 2  # fails twice, succeeds on the 3rd (final) attempt

    await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])

    assert len(collection.upsert_calls) == 3


async def test_transient_failure_exhausts_retries_and_raises_vectordberror(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    collection = fake_chromadb["client"].collections["repo_repo-x"]
    collection.upsert_fail_times = 10  # always fails -- exceeds the retry budget

    with pytest.raises(VectorDBError) as exc_info:
        await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])

    assert exc_info.value.category.value == "transient"
    assert exc_info.value.retryable is True
    assert isinstance(exc_info.value.__cause__, ConnectionError)
    assert len(collection.upsert_calls) == 3  # stop_after_attempt(3)


async def test_operation_on_uninstalled_chromadb_raises_vectordberror() -> None:
    """chromadb is genuinely absent in this venv by design -- the adapter
    must fail with the domain exception, not an unhandled ImportError."""
    client = ChromaClient(settings=Settings())
    with pytest.raises(VectorDBError, match="chromadb package is not installed"):
        await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])


# ---------------------------------------------------------------------------
# health_check (readiness)
# ---------------------------------------------------------------------------
async def test_health_check_false_when_chromadb_not_installed() -> None:
    client = ChromaClient(settings=Settings())
    assert await client.health_check() is False


async def test_health_check_true_on_successful_heartbeat(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    assert await client.health_check() is True


async def test_health_check_false_on_heartbeat_failure_never_raises(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    # Force client construction, then make the heartbeat fail.
    await client.get_or_create_collection("repo-x")
    fake_chromadb["client"].heartbeat_error = ConnectionError("server unreachable")

    assert await client.health_check() is False


# ---------------------------------------------------------------------------
# Resource lifecycle
# ---------------------------------------------------------------------------
async def test_close_is_safe_when_client_was_never_constructed() -> None:
    client = ChromaClient(settings=Settings())
    await client.close()  # must not raise


async def test_close_releases_the_constructed_client(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    assert client._client is not None

    await client.close()

    assert client._client is None


async def test_close_calls_underlying_sdk_close_when_available(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")

    await client.close()

    assert fake_chromadb["client"].closed is True


# ---------------------------------------------------------------------------
# Edge cases: empty-input short circuits, non-retryable errors, client
# construction failure.
# ---------------------------------------------------------------------------
async def test_get_chunks_with_no_ids_returns_empty_without_touching_chromadb() -> None:
    client = ChromaClient(settings=Settings())
    assert await client.get_chunks("repo-x", []) == []
    assert client._client is None  # never constructed -- no-op short-circuited first


async def test_delete_chunks_with_no_ids_is_a_noop_without_touching_chromadb() -> None:
    client = ChromaClient(settings=Settings())
    await client.delete_chunks("repo-x", [])
    assert client._client is None


async def test_client_construction_failure_is_translated_to_vectordberror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _broken_http_client(host: str | None = None, port: int | None = None) -> Any:
        raise RuntimeError("connection refused during handshake")

    fake_module = types.SimpleNamespace(HttpClient=_broken_http_client)
    monkeypatch.setattr(chroma_client_module, "chromadb", fake_module)
    monkeypatch.setattr(chroma_client_module, "_CHROMADB_AVAILABLE", True)

    client = ChromaClient(settings=Settings())
    with pytest.raises(VectorDBError, match="Failed to initialize ChromaDB HTTP client"):
        await client.get_or_create_collection("repo-x")


async def test_non_retryable_error_is_translated_once_without_retrying(
    fake_chromadb: dict[str, FakeChromaSDKClient],
) -> None:
    """A `ValueError` (malformed data, not a connectivity issue) must be
    wrapped into a VectorDBError on the first attempt -- retrying it would
    waste time on a failure retrying can never fix (§14 distinguishes
    transient infra failures from invalid requests)."""
    client = ChromaClient(settings=Settings())
    await client.get_or_create_collection("repo-x")
    collection = fake_chromadb["client"].collections["repo_repo-x"]

    def _broken_upsert(**kwargs: Any) -> None:
        raise ValueError("malformed metadata payload")

    collection.upsert = _broken_upsert  # type: ignore[assignment]

    with pytest.raises(VectorDBError, match="upsert_chunks failed"):
        await client.upsert_chunks("repo-x", [_make_chunk()], [_make_embedding()])
