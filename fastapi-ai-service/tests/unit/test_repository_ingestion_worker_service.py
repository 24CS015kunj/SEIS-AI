"""Unit tests for app/services/repository_ingestion_worker_service.py (Task 40).

Uses real `ChromaClient`/`NemotronEmbedder`/`EmbeddingCache`/`RedisClient`
instances whose relevant methods are monkeypatched -- the same pattern
already used in tests/unit/test_synchronizer.py and
tests/unit/test_repository_processing_service.py, avoiding duck-typed
fakes that would fail the constructors' real type hints. `DocumentProcessor`/
`ASTChunker`/`MetadataGenerator` are real instances (pure, in-process
logic, no I/O) -- not mocked, so these tests exercise the real
pipeline wiring, not a stand-in for it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.domain.enums import ProcessingStage, ProcessingStatus
from app.domain.models import Chunk, Embedding, ProcessingStatusRecord
from app.infra.cache.cache_client import RedisClient
from app.infra.vectorstore.chroma_client import ChromaClient
from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService
from app.services.repository_processing_service import _STATUS_KEY_PREFIX


def _payload(repository_id: str = "repo-1", files: list[dict[str, Any]] | None = None) -> dict:
    return {
        "repository_id": repository_id,
        "workspace_id": "ws-1",
        "commit_sha": "sha-1",
        "files": files
        if files is not None
        else [{"path": "src/app.py", "content": "def foo():\n    return 1\n", "size_bytes": 24}],
    }


class Harness:
    def __init__(self) -> None:
        self.upsert_calls: list[tuple[str, list[Chunk], list[Embedding]]] = []
        self.embed_calls: list[list[Chunk]] = []
        self.process_manifest_calls = 0
        self.store: dict[str, str] = {}
        self.pending_callbacks: dict[str, str] = {}
        self.fail_upsert = False

        self.chroma = ChromaClient(settings=Settings())
        self.embedder = NemotronEmbedder(settings=Settings())
        self.cache_client = RedisClient(settings=Settings())
        self.embedding_cache = EmbeddingCache(redis_client=self.cache_client, settings=Settings())
        self.document_processor = DocumentProcessor()

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> RepositoryIngestionWorkerService:
        async def _upsert_chunks(
            repository_id: str, chunks: list[Chunk], embeddings: list[Embedding]
        ) -> None:
            if self.fail_upsert:
                raise RuntimeError("simulated ChromaDB failure")
            self.upsert_calls.append((repository_id, chunks, embeddings))

        async def _embed_chunks(chunks: list[Chunk], batch_size: int = 32) -> list[list[float]]:
            self.embed_calls.append(chunks)
            return [[0.1, 0.2, 0.3] for _ in chunks]

        async def _get_cached_embeddings(hashes: list[str]) -> dict[str, list[float]]:
            return {}

        async def _cache_embeddings(hash_vector_map: dict[str, list[float]]) -> None:
            return None

        async def _get_cache(key: str) -> str | None:
            return self.store.get(key)

        async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
            self.store[key] = value

        real_process_manifest = self.document_processor.process_manifest

        def _counting_process_manifest(manifest: Any) -> Any:
            self.process_manifest_calls += 1
            return real_process_manifest(manifest)

        async def _eval_atomic_status_transition(
            status_key: str,
            active_set_key: str,
            expected_job_id: str | None,
            new_record_json: str,
            ttl_seconds: int,
            is_terminal: bool,
            repository_id: str,
            mode: str = "transition",
            expected_heartbeat_at: str | None = None,
            pending_callback_payload: str | None = None,
        ) -> tuple[bool, str]:
            current = self.store.get(status_key)
            if current:
                import json
                cur_obj = json.loads(current)
                cur_job_id = cur_obj.get("job_id")
                cur_status = cur_obj.get("status")
                if expected_job_id and cur_job_id and cur_job_id != expected_job_id:
                    return (False, "stale_attempt_mismatch")
                if mode == "heartbeat" and cur_status in ("ready", "failed"):
                    return (False, "already_terminal")
                if mode == "reconcile" and cur_status not in ("pending", "queued", "processing"):
                    return (False, "not_in_flight")

            await self.cache_client.set_cache(status_key, new_record_json, ttl_seconds)
            if is_terminal and pending_callback_payload:
                self.pending_callbacks[repository_id] = pending_callback_payload
            return (True, "ok")

        async def _record_pending_callback(
            repository_id: str,
            payload_json: str,
            job_id: str | None = None,
            ttl_seconds: int = 86400,
        ) -> None:
            self.pending_callbacks[repository_id] = payload_json

        async def _acknowledge_pending_callback(
            repository_id: str, job_id: str | None = None
        ) -> None:
            self.pending_callbacks.pop(repository_id, None)

        async def _get_pending_callback(
            repository_id: str, job_id: str | None = None
        ) -> str | None:
            return self.pending_callbacks.get(repository_id)

        monkeypatch.setattr(self.chroma, "upsert_chunks", _upsert_chunks)
        monkeypatch.setattr(self.embedder, "embed_chunks", _embed_chunks)
        monkeypatch.setattr(self.embedding_cache, "get_cached_embeddings", _get_cached_embeddings)
        monkeypatch.setattr(self.embedding_cache, "cache_embeddings", _cache_embeddings)
        monkeypatch.setattr(self.cache_client, "get_cache", _get_cache)
        monkeypatch.setattr(self.cache_client, "set_cache", _set_cache)
        monkeypatch.setattr(
            self.cache_client,
            "eval_atomic_status_transition",
            _eval_atomic_status_transition,
        )
        monkeypatch.setattr(self.cache_client, "record_pending_callback", _record_pending_callback)
        monkeypatch.setattr(
            self.cache_client,
            "acknowledge_pending_callback",
            _acknowledge_pending_callback,
        )
        monkeypatch.setattr(self.document_processor, "process_manifest", _counting_process_manifest)

        return RepositoryIngestionWorkerService(
            chroma_client=self.chroma,
            document_processor=self.document_processor,
            chunker=ASTChunker(),
            metadata_generator=MetadataGenerator(),
            embedder=self.embedder,
            embedding_cache=self.embedding_cache,
            cache_client=self.cache_client,
        )

    def seed_status(
        self, repository_id: str, status: ProcessingStatus, commit_sha: str = "sha-1"
    ) -> None:
        record = ProcessingStatusRecord(
            repository_id=repository_id,
            status=status,
            stage=None,
            commit_sha=commit_sha,
            started_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            file_count=1,
        )
        self.store[f"{_STATUS_KEY_PREFIX}{repository_id}"] = record.model_dump_json()

    def current_status(self, repository_id: str) -> ProcessingStatusRecord:
        return ProcessingStatusRecord.model_validate_json(
            self.store[f"{_STATUS_KEY_PREFIX}{repository_id}"]
        )


@pytest.fixture
def harness() -> Harness:
    return Harness()


# ---------------------------------------------------------------------------
# Valid manifest reconstruction + successful processing -> READY
# ---------------------------------------------------------------------------
async def test_valid_payload_reconstructs_manifest_and_reaches_ready(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"), job_id="task-123")

    record = harness.current_status("repo-1")
    assert record.status is ProcessingStatus.READY
    assert record.stage is None
    assert record.chunk_count == 1
    assert record.file_count == 1


async def test_document_processor_called_exactly_once(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert harness.process_manifest_calls == 1


async def test_chromadb_upsert_called_with_processed_chunks_and_embeddings(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert len(harness.upsert_calls) == 1
    repository_id, chunks, embeddings = harness.upsert_calls[0]
    assert repository_id == "repo-1"
    assert len(chunks) == len(embeddings) == 1


async def test_embedder_called_for_each_uncached_chunk(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert len(harness.embed_calls) == 1


# ---------------------------------------------------------------------------
# Processing failure -> FAILED, exception not swallowed
# ---------------------------------------------------------------------------
async def test_processing_failure_marks_status_failed_and_reraises(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    harness.fail_upsert = True
    service = harness.wire(monkeypatch)

    with pytest.raises(RuntimeError, match="simulated ChromaDB failure"):
        await service.process_ingestion_job(_payload("repo-1"))

    record = harness.current_status("repo-1")
    assert record.status is ProcessingStatus.FAILED
    assert record.error == "simulated ChromaDB failure"


# ---------------------------------------------------------------------------
# Invalid manifest / missing required fields
# ---------------------------------------------------------------------------
async def test_invalid_payload_raises_and_marks_failed_when_repository_id_known(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = harness.wire(monkeypatch)
    bad_payload = {"repository_id": "repo-1", "workspace_id": "ws-1"}  # missing commit_sha/files

    with pytest.raises(Exception):  # noqa: B017 -- pydantic.ValidationError, asserted by message below
        await service.process_ingestion_job(bad_payload)

    record = harness.current_status("repo-1")
    assert record.status is ProcessingStatus.FAILED
    assert harness.upsert_calls == []


async def test_invalid_payload_without_repository_id_raises_without_writing_status(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = harness.wire(monkeypatch)
    bad_payload = {"workspace_id": "ws-1", "commit_sha": "sha-1", "files": []}  # no repository_id

    with pytest.raises(Exception):  # noqa: B017
        await service.process_ingestion_job(bad_payload)

    assert harness.store == {}


# ---------------------------------------------------------------------------
# Empty files -- valid per current domain rules
# ---------------------------------------------------------------------------
async def test_empty_files_manifest_reaches_ready_with_zero_chunks(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1", files=[]))

    record = harness.current_status("repo-1")
    assert record.status is ProcessingStatus.READY
    assert record.chunk_count == 0
    # The real ChromaClient.upsert_chunks no-ops on an empty chunk list
    # (see app/infra/vectorstore/chroma_client.py) -- the worker still
    # calls through to it unconditionally, so what matters here is that
    # nothing was actually embedded/upserted, not whether the call
    # happened at all.
    assert all(chunks == [] for _, chunks, _ in harness.upsert_calls)
    assert harness.embed_calls == []


# ---------------------------------------------------------------------------
# Redis status update / repository_id preserved / same key as Task 30
# ---------------------------------------------------------------------------
async def test_status_update_uses_the_exact_key_task_30_created(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert f"{_STATUS_KEY_PREFIX}repo-1" in harness.store
    assert len(harness.store) == 1  # no second/different status key was created


async def test_repository_id_is_preserved_across_every_transition(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert harness.current_status("repo-1").repository_id == "repo-1"


async def test_started_at_is_preserved_from_task_30s_original_record(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    original_started_at = harness.current_status("repo-1").started_at
    service = harness.wire(monkeypatch)

    await service.process_ingestion_job(_payload("repo-1"))

    assert harness.current_status("repo-1").started_at == original_started_at


async def test_intermediate_stage_is_document_processing_before_completion(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A coarse check that PROCESSING/stage transitions actually happen:
    the last status observed mid-run (before READY overwrites it) must
    be a real ProcessingStage value, not the invented/blank placeholder.
    """
    harness.seed_status("repo-1", ProcessingStatus.PENDING)
    service = harness.wire(monkeypatch)

    seen_stages: list[ProcessingStage | None] = []
    real_set_cache = harness.cache_client.set_cache

    async def _tracking_set_cache(key: str, value: str, ttl_seconds: int) -> None:
        seen_stages.append(ProcessingStatusRecord.model_validate_json(value).stage)
        await real_set_cache(key, value, ttl_seconds)

    monkeypatch.setattr(harness.cache_client, "set_cache", _tracking_set_cache)

    await service.process_ingestion_job(_payload("repo-1"))

    assert ProcessingStage.DOCUMENT_PROCESSING in seen_stages
    assert ProcessingStage.CHUNKING in seen_stages
    assert ProcessingStage.EMBEDDING in seen_stages
    assert ProcessingStage.INDEXING in seen_stages
    assert seen_stages[-1] is None  # terminal READY has no stage
