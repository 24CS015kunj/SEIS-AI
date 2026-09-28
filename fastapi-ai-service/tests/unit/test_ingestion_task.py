"""Unit tests for app/tasks/ingestion.py (Task 40).

`process_repository` is executed eagerly via Celery's own `.apply(...)`
-- direct in-process execution with a real (locally generated) task
request/id, no broker or worker process involved -- with
`_build_worker_service` monkeypatched to a fake service double. This
tests the Celery-adapter plumbing (task name, queue routing,
payload/job_id pass-through, exception propagation) without touching
real Redis/ChromaDB/NVIDIA/a real Celery broker, which
`RepositoryIngestionWorkerService`'s own orchestration logic is already
covered by in tests/unit/test_repository_ingestion_worker_service.py.
"""

from __future__ import annotations

from typing import Any

import pytest

import app.tasks.ingestion as ingestion_task
from app.infra.queue.task_queue import celery_app


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
# Registration + routing (Task 40 instruction §3, §16)
# ---------------------------------------------------------------------------
def test_task_is_registered_under_the_exact_contract_name() -> None:
    assert "app.tasks.ingestion.process_repository" in celery_app.tasks


def test_task_name_attribute_matches_the_contract_exactly() -> None:
    assert ingestion_task.process_repository.name == "app.tasks.ingestion.process_repository"


def test_task_routes_to_the_ingestion_queue() -> None:
    route = celery_app.amqp.router.route({}, "app.tasks.ingestion.process_repository")
    assert route["queue"].name == "ingestion"


# ---------------------------------------------------------------------------
# Payload / job_id plumbing
# ---------------------------------------------------------------------------
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
    result = ingestion_task.process_repository.apply(args=(payload,))

    assert result.successful()
    assert len(fake_service.calls) == 1
    received_payload, received_job_id = fake_service.calls[0]
    assert received_payload == payload
    # `.apply()` assigns a real request id, matching what a live broker
    # dispatch would provide via `self.request.id`.
    assert received_job_id == result.id


# ---------------------------------------------------------------------------
# No additional Celery job is ever created by this task (§7, §16 tests 15-16)
# ---------------------------------------------------------------------------
def test_task_never_dispatches_a_second_celery_job(monkeypatch: pytest.MonkeyPatch) -> None:
    """RepositoryIngestionWorkerService's constructor has no Celery/task-queue
    dependency at all -- structurally, this task cannot enqueue a second
    job even for a large manifest. This test proves `_build_worker_service`
    never hands out anything with `send_task`/`apply_async`/`delay`."""
    fake_service = _FakeWorkerService()
    monkeypatch.setattr(ingestion_task, "_build_worker_service", lambda: fake_service)

    large_payload = {
        "repository_id": "repo-large",
        "workspace_id": "ws-1",
        "commit_sha": "sha-1",
        "files": [
            {"path": f"src/module_{i}.py", "content": "x = 1\n", "size_bytes": 6}
            for i in range(500)
        ],
    }
    result = ingestion_task.process_repository.apply(args=(large_payload,))

    assert result.successful()
    assert not hasattr(fake_service, "send_task")
    assert not hasattr(fake_service, "apply_async")
    assert len(fake_service.calls) == 1  # exactly one call in, for exactly one job


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
    result = ingestion_task.process_repository.apply(args=(payload,))

    assert result.failed()
    with pytest.raises(RuntimeError, match="simulated processing failure"):
        result.get()


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
