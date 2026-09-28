"""API-layer tests for POST /repositories/{repository_id}/search (Task 53).

Exercises the HTTP boundary only -- authentication, request
validation, domain-exception-to-status-code mapping, and response
shape. The service boundary (SemanticSearchService) is mocked via
FastAPI `dependency_overrides`, never invoked for real: no NVIDIA or
ChromaDB connection is made by this suite (same posture as
test_ingest_routes.py).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.deps import get_semantic_search_service, get_settings_dep, verify_service_token
from app.config.settings import Settings
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import DomainValidationError, EmbeddingError, VectorDBError
from app.domain.models import ChunkMetadata, SearchResponse, SearchResultItem
from app.main import app

SEARCH_URL = "/api/v1/repositories/{repository_id}/search"


def _result(chunk_id: str = "c1", score: float = 0.9) -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content="def solve_maze(): ...",
        score=score,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path="src/maze.py",
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=10,
        ),
    )


class _StubService:
    """Test double standing in for SemanticSearchService."""

    def __init__(
        self,
        *,
        response: SearchResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self._response = response
        self._error = error
        self.received: dict[str, str] | None = None

    async def search(self, repository_id: str, query: str) -> SearchResponse:
        self.received = {"repository_id": repository_id, "query": query}
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response


def _default_response(repository_id: str = "repo-1", query: str = "query") -> SearchResponse:
    return SearchResponse(repository_id=repository_id, query=query, results=[_result()])


@pytest.fixture(autouse=True)
def _clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_service() -> Any:
    """Returns a (TestClient, set_service) pair.

    `set_service(stub)` swaps in a `_StubService` for
    `get_semantic_search_service` and bypasses real Bearer-token
    verification -- used by every test that isn't specifically about
    authentication itself.
    """

    def _set(stub: _StubService) -> TestClient:
        app.dependency_overrides[get_semantic_search_service] = lambda: stub
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

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "hello"})

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_invalid_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(
        SEARCH_URL.format(repository_id="repo-1"),
        json={"query": "hello"},
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_valid_authentication_reaches_the_service(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)
    app.dependency_overrides[get_semantic_search_service] = lambda: stub

    resp = client.post(
        SEARCH_URL.format(repository_id="repo-1"),
        json={"query": "hello"},
        headers={"Authorization": "Bearer real-secret"},
    )

    assert resp.status_code == 200
    assert stub.received is not None


# ---------------------------------------------------------------------------
# Successful search / response shape
# ---------------------------------------------------------------------------
def test_successful_search_returns_200_with_expected_body(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response("repo-1", "how does the maze solver work?"))
    client = client_with_service(stub)

    resp = client.post(
        SEARCH_URL.format(repository_id="repo-1"),
        json={"query": "how does the maze solver work?"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["repository_id"] == "repo-1"
    assert body["query"] == "how does the maze solver work?"
    assert len(body["results"]) == 1
    result = body["results"][0]
    assert result["chunk_id"] == "c1"
    assert result["content"] == "def solve_maze(): ..."
    assert result["score"] == 0.9
    assert result["metadata"]["file_path"] == "src/maze.py"
    assert result["metadata"]["start_line"] == 1
    assert result["metadata"]["end_line"] == 10


def test_repository_id_comes_from_the_url_not_the_body(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response("repo-1", "query"))
    client = client_with_service(stub)

    client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "query"})

    assert stub.received == {"repository_id": "repo-1", "query": "query"}


def test_empty_results_returns_200_with_empty_list(client_with_service: Any) -> None:
    stub = _StubService(response=SearchResponse(repository_id="repo-1", query="query", results=[]))
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "query"})

    assert resp.status_code == 200
    assert resp.json()["results"] == []


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------
def test_missing_query_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={})

    assert resp.status_code == 422


def test_empty_string_query_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": ""})

    assert resp.status_code == 422


def test_whitespace_only_query_is_rejected_by_the_service(client_with_service: Any) -> None:
    """Pydantic's `min_length=1` alone accepts a single space -- the
    deeper blank check lives in SemanticSearchService, same "shape
    Pydantic can't express" reasoning as ingest_routes.py's
    repository_id guard. The service is stubbed here to raise exactly
    what the real one would (see test_semantic_search_service.py for
    that behavior tested directly)."""
    stub = _StubService(error=DomainValidationError("query must not be blank."))
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "   "})

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "DOMAIN_VALIDATION_ERROR"


def test_malformed_json_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(
        SEARCH_URL.format(repository_id="repo-1"),
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 422


def test_repository_id_in_body_is_rejected_not_silently_ignored(
    client_with_service: Any,
) -> None:
    """There is no `repository_id` field in SearchRequest at all -- the
    URL path is the single source of truth, same convention
    IngestRequest already established."""
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(
        SEARCH_URL.format(repository_id="repo-1"),
        json={"query": "hello", "repository_id": "repo-2"},
    )

    assert resp.status_code == 422


# A blank/whitespace-only repository_id (e.g. "%20") is validated inside
# SemanticSearchService, not this route -- unlike ingest_routes.py, which
# does its own inline blank check before ever calling the service. A
# route-level test using a stub service can't observe that check (the
# stub doesn't replicate it); test_semantic_search_service.py's
# test_blank_repository_id_raises_domain_validation_error already covers
# it directly against the real service.


# ---------------------------------------------------------------------------
# Domain exception -> HTTP status mapping (propagated, not re-caught)
# ---------------------------------------------------------------------------
def test_embedding_error_returns_502(client_with_service: Any) -> None:
    stub = _StubService(error=EmbeddingError("Nemotron embedding call failed."))
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "query"})

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "EMBEDDING_ERROR"


def test_vector_db_error_returns_503(client_with_service: Any) -> None:
    stub = _StubService(error=VectorDBError("ChromaDB unreachable."))
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "query"})

    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "VECTOR_DB_ERROR"


def test_unexpected_service_exception_returns_500_without_leaking_details(
    client_with_service: Any,
) -> None:
    stub = _StubService(error=RuntimeError("api_key=super-secret-value leaked?"))
    client = client_with_service(stub)

    resp = client.post(SEARCH_URL.format(repository_id="repo-1"), json={"query": "query"})

    assert resp.status_code == 500
    body = resp.json()
    assert "super-secret-value" not in resp.text
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
