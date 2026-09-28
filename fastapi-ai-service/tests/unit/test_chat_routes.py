"""API-layer tests for POST /repositories/{repository_id}/chat (Task 54).

Exercises the HTTP boundary only -- authentication, request
validation, domain-exception-to-status-code mapping, and response
shape. The service boundary (RepositoryChatService) is mocked via
FastAPI `dependency_overrides`, never invoked for real: no Gemini,
NVIDIA, or ChromaDB connection is made by this suite (same posture as
test_ingest_routes.py/test_search_routes.py).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.deps import get_repository_chat_service, get_settings_dep, verify_service_token
from app.config.settings import Settings
from app.domain.exceptions import DomainValidationError, LLMError, RerankError, VectorDBError
from app.domain.models import ChatRequest, ChatResponse, Citation
from app.main import app

CHAT_URL = "/api/v1/repositories/{repository_id}/chat"


class _StubService:
    """Test double standing in for RepositoryChatService."""

    def __init__(
        self,
        *,
        response: ChatResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self._response = response
        self._error = error
        self.received: ChatRequest | None = None

    async def chat(self, request: ChatRequest) -> ChatResponse:
        self.received = request
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response


def _default_response(conversation_id: str = "conv-1") -> ChatResponse:
    return ChatResponse(
        conversation_id=conversation_id,
        answer="The maze solver uses BFS. [1]",
        citations=[Citation(file_path="src/maze.py", start_line=1, end_line=10, chunk_id="c1")],
    )


@pytest.fixture(autouse=True)
def _clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_service() -> Any:
    """Returns a (TestClient, set_service) pair.

    `set_service(stub)` swaps in a `_StubService` for
    `get_repository_chat_service` and bypasses real Bearer-token
    verification -- used by every test that isn't specifically about
    authentication itself.
    """

    def _set(stub: _StubService) -> TestClient:
        app.dependency_overrides[get_repository_chat_service] = lambda: stub
        app.dependency_overrides[verify_service_token] = lambda: "test-token"
        return TestClient(app, raise_server_exceptions=False)

    return _set


def _payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "message": "how does the maze solving algorithm work?",
        "conversation_id": "conv-1",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# 1-3. Authentication (real verify_service_token, not overridden)
# ---------------------------------------------------------------------------
def test_missing_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_invalid_authentication_returns_401() -> None:
    app.dependency_overrides[get_settings_dep] = lambda: Settings(
        internal_api_key=SecretStr("real-secret")
    )
    client = TestClient(app)

    resp = client.post(
        CHAT_URL.format(repository_id="repo-1"),
        json=_payload(),
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
    app.dependency_overrides[get_repository_chat_service] = lambda: stub

    resp = client.post(
        CHAT_URL.format(repository_id="repo-1"),
        json=_payload(),
        headers={"Authorization": "Bearer real-secret"},
    )

    assert resp.status_code == 200
    assert stub.received is not None


# ---------------------------------------------------------------------------
# 4, 14. Successful response / response shape
# ---------------------------------------------------------------------------
def test_successful_chat_returns_200_with_expected_body(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response("conv-1"))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 200
    body = resp.json()
    assert body["conversation_id"] == "conv-1"
    assert body["answer"] == "The maze solver uses BFS. [1]"
    assert len(body["citations"]) == 1
    citation = body["citations"][0]
    assert citation["file_path"] == "src/maze.py"
    assert citation["start_line"] == 1
    assert citation["end_line"] == 10
    assert citation["chunk_id"] == "c1"
    assert body["token_usage"] is None


# ---------------------------------------------------------------------------
# 5-6. repository_id comes from the URL, not the body
# ---------------------------------------------------------------------------
def test_repository_id_comes_from_the_url_not_the_body(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert stub.received is not None
    assert stub.received.repository_id == "repo-1"
    assert stub.received.conversation_id == "conv-1"
    assert stub.received.message == "how does the maze solving algorithm work?"
    assert stub.received.history == []


def test_repository_id_in_body_is_rejected_not_silently_ignored(client_with_service: Any) -> None:
    """There is no `repository_id` field in ChatMessageRequest at all --
    the URL path is the single source of truth, same convention
    IngestRequest/SearchRequest already established."""
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(
        CHAT_URL.format(repository_id="repo-1"),
        json=_payload(repository_id="repo-2"),
    )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 7-10. Request validation
# ---------------------------------------------------------------------------
def test_empty_string_message_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload(message=""))

    assert resp.status_code == 422


def test_whitespace_only_message_is_rejected_by_the_service(client_with_service: Any) -> None:
    """Pydantic's `min_length=1` alone accepts a single space -- the
    deeper blank check lives in RepositoryChatService, same "shape
    Pydantic can't express" reasoning as ingest_routes.py's
    repository_id guard. The service is stubbed here to raise exactly
    what the real one would (see test_repository_chat_service.py for
    that behavior tested directly)."""
    stub = _StubService(error=DomainValidationError("message must not be blank."))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload(message="   "))

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "DOMAIN_VALIDATION_ERROR"


def test_missing_conversation_id_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)
    payload = _payload()
    del payload["conversation_id"]

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=payload)

    assert resp.status_code == 422


def test_empty_string_conversation_id_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload(conversation_id=""))

    assert resp.status_code == 422


def test_whitespace_only_conversation_id_is_rejected_by_the_service(
    client_with_service: Any,
) -> None:
    stub = _StubService(error=DomainValidationError("conversation_id must not be blank."))
    client = client_with_service(stub)

    resp = client.post(
        CHAT_URL.format(repository_id="repo-1"), json=_payload(conversation_id="   ")
    )

    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "DOMAIN_VALIDATION_ERROR"


def test_malformed_json_returns_422(client_with_service: Any) -> None:
    stub = _StubService(response=_default_response())
    client = client_with_service(stub)

    resp = client.post(
        CHAT_URL.format(repository_id="repo-1"),
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 12-13. Domain exception -> HTTP status mapping (propagated, not re-caught)
# ---------------------------------------------------------------------------
def test_retrieval_error_returns_503(client_with_service: Any) -> None:
    stub = _StubService(error=VectorDBError("ChromaDB unreachable."))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "VECTOR_DB_ERROR"


def test_rerank_error_returns_502(client_with_service: Any) -> None:
    stub = _StubService(error=RerankError("NVIDIA reranking failed."))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "RERANK_ERROR"


def test_llm_error_returns_502(client_with_service: Any) -> None:
    stub = _StubService(error=LLMError("Gemini generation failed."))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "LLM_ERROR"


def test_unexpected_service_exception_returns_500_without_leaking_details(
    client_with_service: Any,
) -> None:
    stub = _StubService(error=RuntimeError("api_key=super-secret-value leaked?"))
    client = client_with_service(stub)

    resp = client.post(CHAT_URL.format(repository_id="repo-1"), json=_payload())

    assert resp.status_code == 500
    body = resp.json()
    assert "super-secret-value" not in resp.text
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
