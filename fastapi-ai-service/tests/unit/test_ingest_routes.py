"""API-layer tests for POST /repositories/{repository_id}/ingest (Task 36).

Exercises the HTTP boundary only -- authentication, request validation,
domain-exception-to-status-code mapping, and response shape. The
service boundary (`RepositoryProcessingService`) is mocked via FastAPI
`dependency_overrides`, never invoked for real: no Celery, Redis, or
ChromaDB connection is made by this suite (§Task 36 instruction 15).
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.deps import get_repository_processing_service, get_settings_dep, verify_service_token
from app.config.settings import Settings
from app.domain.enums import ProcessingStatus
from app.domain.exceptions import BusinessError, QueueError, RepositoryNotFoundError
from app.domain.models import JobSubmissionResult, RepositoryManifest
from app.main import app

INGEST_URL = "/api/v1/repositories/{repository_id}/ingest"


def _valid_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "workspace_id": "ws-1",
        "commit_sha": "abc1234",
        "files": [
            {"path": "a.py", "content": "print(1)", "language": "python", "size_bytes": 9},
        ],
    }
    payload.update(overrides)
    return payload


class _StubService:
    """Test double standing in for RepositoryProcessingService.

    Either returns a canned `JobSubmissionResult` or raises a
    pre-configured exception -- `submit_ingestion_job` never runs for
    real, so nothing here touches Celery/Redis.
    """

    def __init__(
        self, *, result: JobSubmissionResult | None = None, error: Exception | None = None
    ) -> None:
        self._result = result
        self._error = error
        self.received_manifest: RepositoryManifest | None = None

    async def submit_ingestion_job(self, manifest: RepositoryManifest) -> JobSubmissionResult:
        self.received_manifest = manifest
        if self._error is not None:
            raise self._error
        assert self._result is not None
        return self._result


def _default_result(repository_id: str = "repo-1") -> JobSubmissionResult:
    return JobSubmissionResult(
        repository_id=repository_id,
        job_id="task-123",
        status=ProcessingStatus.PENDING,
        submitted_at=datetime.now(UTC),
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-service-secret"}


@pytest.fixture(autouse=True)
def _clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_service() -> Any:
    """Returns a (TestClient, set_service) pair.

    `set_service(stub)` swaps in a `_StubService` for
    `get_repository_processing_service` and bypasses real Bearer-token
    verification -- used by every test that isn't specifically about
    authentication itself.
    """

    def _set(stub: _StubService) -> TestClient:
        app.dependency_overrides[get_repository_processing_service] = lambda: stub
        app.dependency_overrides[verify_service_token] = lambda: "test-token"
        return TestClient(app, raise_server_exceptions=False)

    return _set


# ---------------------------------------------------------------------------
# Authentication (real verify_service_token, not overridden)
# ---------------------------------------------------------------------------
def test_missing_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload())

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_invalid_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(),
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_valid_authentication_reaches_the_service(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)
    app.dependency_overrides[get_repository_processing_service] = lambda: stub

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(),
        headers={"Authorization": "Bearer real-secret"},
    )

    assert resp.status_code == 202
    assert stub.received_manifest is not None


# ---------------------------------------------------------------------------
# Successful submission / response shape
# ---------------------------------------------------------------------------
def test_successful_job_submission_returns_202_with_expected_body(
    client_with_service: Any,
) -> None:
    stub = _StubService(result=_default_result("repo-1"))
    client = client_with_service(stub)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"), json=_valid_payload(), headers=None
    )

    assert resp.status_code == 202
    body = resp.json()
    assert body["repository_id"] == "repo-1"
    assert body["job_id"] == "task-123"
    assert body["status"] == "pending"
    assert "submitted_at" in body


def test_manifest_is_constructed_correctly_from_the_request_body(
    client_with_service: Any,
) -> None:
    stub = _StubService(result=_default_result("repo-1"))
    client = client_with_service(stub)

    client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(commit_sha="deadbeef"),
    )

    manifest = stub.received_manifest
    assert manifest is not None
    assert manifest.repository_id == "repo-1"  # taken from the URL, not the body
    assert manifest.workspace_id == "ws-1"
    assert manifest.commit_sha == "deadbeef"
    assert len(manifest.files) == 1
    assert manifest.files[0].path == "a.py"
    assert manifest.files[0].content == b"print(1)"  # str -> utf-8 bytes
    assert manifest.files[0].language == "python"
    assert manifest.files[0].size_bytes == 9


def test_file_without_content_maps_to_none(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result("repo-1"))
    client = client_with_service(stub)

    client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(files=[{"path": "image.png", "size_bytes": 5000, "language": None}]),
    )

    assert stub.received_manifest is not None
    assert stub.received_manifest.files[0].content is None


def test_empty_files_list_is_accepted(client_with_service: Any) -> None:
    """Neither RepositoryManifest nor ManifestFile impose a minimum file
    count today, so this endpoint does not invent one either."""
    stub = _StubService(result=_default_result("repo-1"))
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload(files=[]))

    assert resp.status_code == 202
    assert stub.received_manifest is not None
    assert stub.received_manifest.files == []


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------
def test_malformed_json_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 422


def test_missing_workspace_id_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)
    payload = _valid_payload()
    del payload["workspace_id"]

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=payload)

    assert resp.status_code == 422


def test_missing_commit_sha_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)
    payload = _valid_payload()
    del payload["commit_sha"]

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=payload)

    assert resp.status_code == 422


def test_invalid_file_metadata_negative_size_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(files=[{"path": "a.py", "size_bytes": -1}]),
    )

    assert resp.status_code == 422


def test_invalid_file_metadata_missing_path_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(files=[{"size_bytes": 10}]),
    )

    assert resp.status_code == 422


def test_invalid_repository_id_blank_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="%20"), json=_valid_payload())

    assert resp.status_code == 422


def test_repository_id_in_body_is_rejected_not_silently_ignored(
    client_with_service: Any,
) -> None:
    """There is no `repository_id` field in the request schema at all --
    the URL path is the single source of truth. A caller that sends one
    anyway (e.g. a value that disagrees with the URL) must get an
    explicit 422, not have it silently dropped."""
    stub = _StubService(result=_default_result())
    client = client_with_service(stub)

    resp = client.post(
        INGEST_URL.format(repository_id="repo-1"),
        json=_valid_payload(repository_id="repo-2"),
    )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Domain exception -> HTTP status mapping (propagated, not re-caught)
# ---------------------------------------------------------------------------
def test_business_error_returns_422(client_with_service: Any) -> None:
    stub = _StubService(
        error=BusinessError("Repository 'repo-1' is already undergoing processing.")
    )
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload())

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "BUSINESS_RULE_VIOLATION"


def test_queue_error_returns_503(client_with_service: Any) -> None:
    stub = _StubService(error=QueueError("Failed to enqueue ingestion job."))
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload())

    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "QUEUE_ERROR"


def test_repository_not_found_error_returns_404(client_with_service: Any) -> None:
    """`submit_ingestion_job` never actually raises this in practice
    (only `get_processing_status` does) -- this test instead proves the
    route's generic propagation handles *any* SEISError subclass
    correctly, not just the two the service happens to raise today."""
    stub = _StubService(error=RepositoryNotFoundError("No status record for 'repo-1'."))
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload())

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "REPOSITORY_NOT_FOUND"


def test_unexpected_service_exception_returns_500_without_leaking_details(
    client_with_service: Any,
) -> None:
    stub = _StubService(error=RuntimeError("credentials=super-secret-value leaked?"))
    client = client_with_service(stub)

    resp = client.post(INGEST_URL.format(repository_id="repo-1"), json=_valid_payload())

    assert resp.status_code == 500
    body = resp.json()
    assert "super-secret-value" not in resp.text
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
