"""API-layer tests for POST /repositories/{repository_id}/analyze (Task 69).

Exercises the HTTP boundary only -- authentication, request validation,
domain-exception-to-status-code mapping, and response shape. The service
boundary (RepositoryAnalysisService) is mocked via FastAPI
`dependency_overrides`, same posture as test_chat_routes.py.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.deps import get_repository_analysis_service, get_settings_dep, verify_service_token
from app.config.settings import Settings
from app.domain.exceptions import DomainValidationError
from app.domain.models import CommitInfo, Document
from app.main import app
from app.services.repository_analysis_service import RepositoryAnalysisResult

ANALYZE_URL = "/api/v1/repositories/{repository_id}/analyze"


class _StubService:
    def __init__(
        self, *, result: RepositoryAnalysisResult | None = None, error: Exception | None = None
    ) -> None:
        self._result = result
        self._error = error
        self.received: tuple[str, list[CommitInfo], list[Document]] | None = None

    async def analyze(
        self, repository_id: str, commits: list[CommitInfo], files: list[Document]
    ) -> RepositoryAnalysisResult:
        self.received = (repository_id, commits, files)
        if self._error is not None:
            raise self._error
        assert self._result is not None
        return self._result


def _empty_result() -> RepositoryAnalysisResult:
    from app.domain.models import StructuralTrends

    return RepositoryAnalysisResult(
        generated_at=datetime(2026, 8, 29, tzinfo=UTC),
        hotspots=[],
        trends=StructuralTrends(module_trends=[], high_churn_modules=[]),
        insights=[],
    )


@pytest.fixture(autouse=True)
def _clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_service() -> Any:
    def _set(stub: _StubService) -> TestClient:
        app.dependency_overrides[get_repository_analysis_service] = lambda: stub
        app.dependency_overrides[verify_service_token] = lambda: "test-token"
        return TestClient(app, raise_server_exceptions=False)

    return _set


def _payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "analyzed_commit_sha": "abc123",
        "commits": [
            {
                "commit_sha": "abc123",
                "message": "fix: bug",
                "files_changed": ["backend/maze.py"],
                "author_name": "Nikunj",
                "author_email": "n@example.com",
                "committed_at": "2026-08-01T00:00:00Z",
            }
        ],
        "files": [
            {"file_path": "backend/maze.py", "content": "print(1)\n" * 20, "language": "python"}
        ],
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# 1-2. Authentication (real verify_service_token, not overridden)
# ---------------------------------------------------------------------------
def test_missing_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_valid_authentication_reaches_the_service() -> None:
    stub = _StubService(result=_empty_result())
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    app.dependency_overrides[get_repository_analysis_service] = lambda: stub
    client = TestClient(app)

    resp = client.post(
        ANALYZE_URL.format(repository_id="repo-1"),
        json=_payload(),
        headers={"Authorization": "Bearer real-secret"},
    )

    assert resp.status_code == 200
    assert stub.received is not None


# ---------------------------------------------------------------------------
# 3. repository_id comes from the URL, passed through unchanged.
# ---------------------------------------------------------------------------
def test_repository_id_comes_from_the_url(client_with_service: Any) -> None:
    stub = _StubService(result=_empty_result())
    client = client_with_service(stub)

    resp = client.post(ANALYZE_URL.format(repository_id="repo-42"), json=_payload())

    assert resp.status_code == 200
    assert stub.received is not None
    assert stub.received[0] == "repo-42"


def test_commits_and_files_are_mapped_through_to_the_service(client_with_service: Any) -> None:
    stub = _StubService(result=_empty_result())
    client = client_with_service(stub)

    client.post(ANALYZE_URL.format(repository_id="repo-1"), json=_payload())

    assert stub.received is not None
    _, commits, files = stub.received
    assert len(commits) == 1
    assert commits[0].commit_sha == "abc123"
    assert commits[0].files_changed == ["backend/maze.py"]
    assert len(files) == 1
    assert files[0].file_path == "backend/maze.py"
    assert files[0].commit_sha == "abc123"  # real analyzed_commit_sha, never fabricated


# ---------------------------------------------------------------------------
# 4-7. Request validation
# ---------------------------------------------------------------------------
def test_empty_commits_list_is_accepted_by_the_schema_and_rejected_by_the_service(
    client_with_service: Any,
) -> None:
    """Pydantic allows an empty list; the "at least one commit" rule is a
    business invariant the service itself enforces (same "shape Pydantic
    can't express" pattern chat's blank-message check uses)."""
    stub = _StubService(error=DomainValidationError("At least one commit is required."))
    client = client_with_service(stub)

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=_payload(commits=[]))

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "DOMAIN_VALIDATION_ERROR"


def test_missing_analyzed_commit_sha_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_empty_result())
    client = client_with_service(stub)
    payload = _payload()
    del payload["analyzed_commit_sha"]

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=payload)

    assert resp.status_code == 422


def test_extra_unexpected_field_is_rejected(client_with_service: Any) -> None:
    stub = _StubService(result=_empty_result())
    client = client_with_service(stub)

    resp = client.post(
        ANALYZE_URL.format(repository_id="repo-1"), json=_payload(unexpected_field="x")
    )

    assert resp.status_code == 422


def test_too_many_commits_returns_422(client_with_service: Any) -> None:
    stub = _StubService(result=_empty_result())
    client = client_with_service(stub)
    payload = _payload()
    payload["commits"] = payload["commits"] * 201  # over the 200 cap

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=payload)

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 8. Response shape carries real findings through unchanged.
# ---------------------------------------------------------------------------
def test_successful_analysis_returns_200_with_expected_shape(client_with_service: Any) -> None:
    from app.domain.enums import InsightCategory, InsightSeverity
    from app.domain.models import EngineeringInsight, HotspotMetrics, StructuralTrends

    result = RepositoryAnalysisResult(
        generated_at=datetime(2026, 8, 29, tzinfo=UTC),
        hotspots=[
            HotspotMetrics(
                file_path="backend/maze.py", commit_count=12, line_count=650, hotspot_score=100.0
            )
        ],
        trends=StructuralTrends(module_trends=[], high_churn_modules=[]),
        insights=[
            EngineeringInsight(
                category=InsightCategory.REFACTORING_RECOMMENDED,
                severity=InsightSeverity.MAJOR,
                subject="backend/maze.py",
                summary="'backend/maze.py' is both large and frequently modified.",
                recommendation="Consider decomposing this file.",
            )
        ],
    )
    stub = _StubService(result=result)
    client = client_with_service(stub)

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 200
    body = resp.json()
    assert body["repository_id"] == "repo-1"
    assert body["hotspots"][0]["file_path"] == "backend/maze.py"
    assert body["insights"][0]["subject"] == "backend/maze.py"
    assert body["insights"][0]["category"] == "refactoring_recommended"


# ---------------------------------------------------------------------------
# 9. Unexpected service failure never leaks details.
# ---------------------------------------------------------------------------
def test_unexpected_service_exception_returns_500_without_leaking_details(
    client_with_service: Any,
) -> None:
    stub = _StubService(error=RuntimeError("api_key=super-secret-value leaked?"))
    client = client_with_service(stub)

    resp = client.post(ANALYZE_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 500
    assert "super-secret-value" not in resp.text
