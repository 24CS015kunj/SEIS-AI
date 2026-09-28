"""Unit tests for FastAPI explain routes (Task 93)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.api.deps import get_explain_service, verify_service_token
from app.domain.enums import TaskType
from app.domain.exceptions import SEISAuthorizationError
from app.domain.models import Citation
from app.main import create_app
from app.services.repository_explain_service import ExplainResult


@pytest.fixture
def mock_explain_service():
    service = MagicMock()
    service.explain = AsyncMock(
        return_value=ExplainResult(
            answer="Grounded explanation of backend/maze.py [1].",
            citations=[
                Citation(
                    file_path="backend/maze.py",
                    start_line=1,
                    end_line=20,
                    chunk_id="chunk-123",
                )
            ],
        )
    )
    return service


@pytest.fixture
def test_client(mock_explain_service):
    app = create_app()
    app.dependency_overrides[verify_service_token] = lambda: "test-token"
    app.dependency_overrides[get_explain_service] = lambda: mock_explain_service
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_explain_code_explanation_endpoint_success(test_client, mock_explain_service):
    response = test_client.post(
        "/api/v1/repositories/repo-456/explain",
        headers={"Authorization": "Bearer test-token"},
        json={
            "task_type": "code_explanation",
            "file_path": "backend/maze.py",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["task_type"] == "code_explanation"
    assert data["file_path"] == "backend/maze.py"
    assert "Grounded explanation" in data["answer"]
    assert len(data["citations"]) == 1
    assert data["citations"][0]["file_path"] == "backend/maze.py"

    mock_explain_service.explain.assert_called_once_with(
        repository_id="repo-456",
        task_type=TaskType.CODE_EXPLANATION,
        file_path="backend/maze.py",
    )


def test_explain_architecture_summary_endpoint_success(test_client, mock_explain_service):
    response = test_client.post(
        "/api/v1/repositories/repo-456/explain",
        headers={"Authorization": "Bearer test-token"},
        json={
            "task_type": "architecture_summary",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["task_type"] == "architecture_summary"
    assert data["file_path"] is None
    assert data["answer"] is not None

    mock_explain_service.explain.assert_called_with(
        repository_id="repo-456",
        task_type=TaskType.ARCHITECTURE_SUMMARY,
        file_path=None,
    )


def test_explain_invalid_task_type(test_client):
    response = test_client.post(
        "/api/v1/repositories/repo-456/explain",
        headers={"Authorization": "Bearer test-token"},
        json={
            "task_type": "invalid_type",
        },
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_explain_unauthorized(test_client):
    app = test_client.app

    def raise_auth_error():
        raise SEISAuthorizationError("Missing or malformed Authorization header.")

    app.dependency_overrides[verify_service_token] = raise_auth_error
    response = test_client.post(
        "/api/v1/repositories/repo-456/explain",
        json={"task_type": "architecture_summary"},
    )
    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
