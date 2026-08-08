"""Unit tests for app/core/processing/synchronizer.py (Task 18).

Uses real `DocumentProcessor`/`ASTChunker`/`MetadataGenerator`
instances (pure, in-process logic, no I/O) composed with real
`ChromaClient`/`GeminiEmbedder`/`EmbeddingCache` instances whose public
methods are monkeypatched -- the same pattern already used in
tests/unit/test_embedding_cache.py, avoiding duck-typed fakes that
would fail the constructor's real type hints.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import GeminiEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache, compute_chunk_hash
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.core.processing.synchronizer import IncrementalSynchronizer
from app.domain.models import Chunk, DiffManifest, Embedding, ManifestFile
from app.infra.cache.cache_client import RedisClient
from app.infra.vectorstore.chroma_client import ChromaClient


class Harness:
    def __init__(self) -> None:
        self.delete_calls: list[tuple[str, dict[str, str]]] = []
        self.upsert_calls: list[tuple[str, list[Chunk], list[Embedding]]] = []
        self.embed_calls: list[list[Chunk]] = []
        self.call_order: list[str] = []
        self.cache_store: dict[str, list[float]] = {}
        self.cache_write_calls: list[dict[str, list[float]]] = []

        self.chroma = ChromaClient(settings=Settings())
        self.embedder = GeminiEmbedder(settings=Settings())
        self.cache = EmbeddingCache(
            redis_client=RedisClient(settings=Settings()), settings=Settings()
        )

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> IncrementalSynchronizer:
        async def _delete_chunks_by_metadata(
            repository_id: str, metadata_filter: dict[str, str]
        ) -> None:
            self.call_order.append("delete")
            self.delete_calls.append((repository_id, metadata_filter))

        async def _upsert_chunks(
            repository_id: str, chunks: list[Chunk], embeddings: list[Embedding]
        ) -> None:
            self.call_order.append("upsert")
            self.upsert_calls.append((repository_id, chunks, embeddings))

        async def _embed_chunks(chunks: list[Chunk], batch_size: int = 32) -> list[list[float]]:
            self.embed_calls.append(chunks)
            return [[0.1, 0.2, 0.3] for _ in chunks]

        async def _get_cached_embeddings(hashes: list[str]) -> dict[str, list[float]]:
            return {h: self.cache_store[h] for h in hashes if h in self.cache_store}

        async def _cache_embeddings(hash_vector_map: dict[str, list[float]]) -> None:
            self.cache_write_calls.append(hash_vector_map)
            self.cache_store.update(hash_vector_map)

        monkeypatch.setattr(self.chroma, "delete_chunks_by_metadata", _delete_chunks_by_metadata)
        monkeypatch.setattr(self.chroma, "upsert_chunks", _upsert_chunks)
        monkeypatch.setattr(self.embedder, "embed_chunks", _embed_chunks)
        monkeypatch.setattr(self.cache, "get_cached_embeddings", _get_cached_embeddings)
        monkeypatch.setattr(self.cache, "cache_embeddings", _cache_embeddings)

        return IncrementalSynchronizer(
            chroma_client=self.chroma,
            document_processor=DocumentProcessor(),
            chunker=ASTChunker(),
            metadata_generator=MetadataGenerator(),
            embedder=self.embedder,
            embedding_cache=self.cache,
        )


@pytest.fixture
def harness() -> Harness:
    return Harness()


def _py_file(path: str, content: str) -> ManifestFile:
    return ManifestFile(path=path, content=content.encode("utf-8"), size_bytes=len(content))


# ---------------------------------------------------------------------------
# Task's own Validation criterion: modifying 1 file updates only that
# file's vectors.
# ---------------------------------------------------------------------------
async def test_modifying_one_file_deletes_and_reinserts_only_that_files_vectors(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-2",
        modified_files=[_py_file("src/app.py", "def foo():\n    return 1\n")],
    )

    await synchronizer.process_diff("repo-1", diff)

    assert harness.delete_calls == [("repo-1", {"file_path": "src/app.py"})]
    assert len(harness.upsert_calls) == 1
    repository_id, chunks, embeddings = harness.upsert_calls[0]
    assert repository_id == "repo-1"
    assert all(c.metadata.file_path == "src/app.py" for c in chunks)
    assert len(embeddings) == len(chunks)


# ---------------------------------------------------------------------------
# Common Mistake guarded against: delete happens before insert.
# ---------------------------------------------------------------------------
async def test_stale_chunks_are_deleted_before_new_ones_are_inserted(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-2",
        modified_files=[_py_file("src/app.py", "def foo():\n    return 1\n")],
    )

    await synchronizer.process_diff("repo-1", diff)

    assert harness.call_order == ["delete", "upsert"]


# ---------------------------------------------------------------------------
# Added-only / deleted-only files
# ---------------------------------------------------------------------------
async def test_added_files_only_triggers_no_delete_calls(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-1",
        added_files=[_py_file("src/new.py", "def bar():\n    return 2\n")],
    )

    await synchronizer.process_diff("repo-1", diff)

    assert harness.delete_calls == []
    assert len(harness.upsert_calls) == 1


async def test_deleted_files_only_triggers_no_upsert_or_embed_calls(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(workspace_id="ws-1", commit_sha="sha-2", deleted_files=["src/gone.py"])

    await synchronizer.process_diff("repo-1", diff)

    assert harness.delete_calls == [("repo-1", {"file_path": "src/gone.py"})]
    assert harness.upsert_calls == []
    assert harness.embed_calls == []


async def test_added_file_filtered_out_by_document_processor_produces_no_chunks(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A binary file passes DocumentProcessor's filter stage and never
    becomes a Document, so no chunks exist to embed/upsert -- exercises
    the "diff produced files but zero indexable chunks" branch."""
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-1",
        added_files=[ManifestFile(path="assets/logo.png", content=b"\x89PNG\r\n", size_bytes=6)],
    )

    await synchronizer.process_diff("repo-1", diff)

    assert harness.upsert_calls == []
    assert harness.embed_calls == []


async def test_deleted_file_paths_are_normalized_before_deletion(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(workspace_id="ws-1", commit_sha="sha-2", deleted_files=["Src\\Gone.PY"])

    await synchronizer.process_diff("repo-1", diff)

    assert harness.delete_calls == [("repo-1", {"file_path": "src/gone.py"})]


# ---------------------------------------------------------------------------
# Embedding cache reuse
# ---------------------------------------------------------------------------
async def test_cached_chunk_content_skips_the_embedding_call(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = "def foo():\n    return 1\n"
    from app.core.embedding.embedder import EMBEDDING_MODEL_NAME

    # Pre-seed the cache for the chunk this diff will produce -- the
    # AST chunker treats this one-liner-body function as a single
    # CODE_FUNCTION chunk whose content is exactly the function source.
    chunk_source = "def foo():\n    return 1"
    harness.cache_store[compute_chunk_hash(chunk_source, EMBEDDING_MODEL_NAME)] = [9.0, 9.0, 9.0]

    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1", commit_sha="sha-1", added_files=[_py_file("src/app.py", content)]
    )

    await synchronizer.process_diff("repo-1", diff)

    assert harness.embed_calls == []  # cache hit -- embedder never called
    _, _, embeddings = harness.upsert_calls[0]
    assert embeddings[0].vector == [9.0, 9.0, 9.0]


async def test_uncached_chunk_is_embedded_and_then_written_to_cache(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-1",
        added_files=[_py_file("src/app.py", "def foo():\n    return 1\n")],
    )

    await synchronizer.process_diff("repo-1", diff)

    assert len(harness.embed_calls) == 1
    assert len(harness.cache_write_calls) == 1
    assert len(harness.cache_store) == 1


# ---------------------------------------------------------------------------
# Failure propagation (no swallowed exceptions)
# ---------------------------------------------------------------------------
async def test_upsert_failure_propagates_and_is_not_swallowed(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)

    async def _broken_upsert(repository_id: str, chunks: Any, embeddings: Any) -> None:
        raise RuntimeError("simulated ChromaDB failure")

    monkeypatch.setattr(harness.chroma, "upsert_chunks", _broken_upsert)

    diff = DiffManifest(
        workspace_id="ws-1",
        commit_sha="sha-1",
        added_files=[_py_file("src/app.py", "def foo():\n    return 1\n")],
    )

    with pytest.raises(RuntimeError, match="simulated ChromaDB failure"):
        await synchronizer.process_diff("repo-1", diff)


# ---------------------------------------------------------------------------
# No-op diff
# ---------------------------------------------------------------------------
async def test_empty_diff_touches_neither_chroma_nor_the_embedder(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    synchronizer = harness.wire(monkeypatch)
    diff = DiffManifest(workspace_id="ws-1", commit_sha="sha-1")

    await synchronizer.process_diff("repo-1", diff)

    assert harness.delete_calls == []
    assert harness.upsert_calls == []
    assert harness.embed_calls == []
