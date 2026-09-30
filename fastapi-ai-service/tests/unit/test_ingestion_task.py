"""Unit tests for app/tasks/ingestion.py (Task 40 / Task T5).

`process_repository` is executed directly as a standard callable in-process
(with Celery removed per Architecture E in Task T5) -- with
`_build_worker_service` monkeypatched to a fake service double. This
tests the task-runner plumbing (payload/job_id pass-through,
exception propagation) without touching real Redis/ChromaDB/NVIDIA, which
`RepositoryIngestionWorkerService`'s own orchestration logic is already
covered by in tests/unit/test_repository_ingestion_worker_service.py.
"""

from __future__ import annotations

from typing import Any

import pytest

import app.tasks.ingestion as ingestion_task


class _FakeWorkerService:
    def __init__(self, *, fail: bool = False) -> None:
        self.calls: list[tuple[dict[str, Any], str | None]] = []
        self.fail = fail

    async def process_ingestion_job(
        self, payload: dict[str, Any], *, job_id: str | None = None
    ) -> None:
        self.calls.append((payload, job_id))
        if self.fail:
            raise RuntimeError("simulated processing failure")


# ---------------------------------------------------------------------------
# Direct callable & payload / job_id plumbing (Task T5)
# ---------------------------------------------------------------------------
def test_task_is_callable() -> None:
    assert callable(ingestion_task.process_repository)


def test_task_passes_payload_and_job_id_through_to_the_worker_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_service = _FakeWorkerService()
    monkeypatch.setattr(ingestion_task, "_build_worker_service", lambda: fake_service)

    payload = {
        "repository_id": "repo-1",
        "workspace_id": "ws-1",
        "commit_sha": "sha-1",
        "files": [],
    }
    ingestion_task.process_repository(payload, job_id="job-abc-123")

    assert len(fake_service.calls) == 1
    received_payload, received_job_id = fake_service.calls[0]
    assert received_payload == payload
    assert received_job_id == "job-abc-123"


def test_task_runs_without_explicit_job_id(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = _FakeWorkerService()
    monkeypatch.setattr(ingestion_task, "_build_worker_service", lambda: fake_service)

    payload = {
        "repository_id": "repo-1",
        "workspace_id": "ws-1",
        "commit_sha": "sha-1",
        "files": [],
    }
    ingestion_task.process_repository(payload)

    assert len(fake_service.calls) == 1
    received_payload, received_job_id = fake_service.calls[0]
    assert received_payload == payload
    assert received_job_id is None


# ---------------------------------------------------------------------------
# Exceptions are not silently swallowed
# ---------------------------------------------------------------------------
def test_task_reraises_worker_service_exceptions(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = _FakeWorkerService(fail=True)
    monkeypatch.setattr(ingestion_task, "_build_worker_service", lambda: fake_service)

    payload = {
        "repository_id": "repo-1",
        "workspace_id": "ws-1",
        "commit_sha": "sha-1",
        "files": [],
    }
    with pytest.raises(RuntimeError, match="simulated processing failure"):
        ingestion_task.process_repository(payload, job_id="job-fail-1")


# ---------------------------------------------------------------------------
# Composition-root singletons (construction is lazy, never opens a
# connection -- matches every other infra-client provider's own tests)
# ---------------------------------------------------------------------------
def test_build_worker_service_returns_a_real_worker_service() -> None:
    from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService

    service = ingestion_task._build_worker_service()
    assert isinstance(service, RepositoryIngestionWorkerService)


def test_infra_client_providers_are_process_wide_singletons() -> None:
    assert ingestion_task._get_chroma_client() is ingestion_task._get_chroma_client()
    assert ingestion_task._get_cache_client() is ingestion_task._get_cache_client()
    assert ingestion_task._get_embedder() is ingestion_task._get_embedder()
    assert ingestion_task._get_embedding_cache() is ingestion_task._get_embedding_cache()

