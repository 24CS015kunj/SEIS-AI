"""Unit tests for Software Evolution analysis route (Task #9)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.api.deps import get_evolution_analysis_service, verify_service_token
from app.domain.models import EvolutionReport
from app.main import app


@pytest.fixture
def mock_evolution_service() -> AsyncMock:
    service = AsyncMock()
    service.analyze_evolution.return_value = EvolutionReport(
        repository_id="repo-evolution-123",
        markdown="# Software Evolution Report\n\nHigh churn detected in `src/main.py`.",
        generated_at=datetime.now(timezone.utc),
        indexed_chunk_count=5,
    )
    return service


def test_analyze_software_evolution_endpoint(mock_evolution_service: AsyncMock) -> None:
    app.dependency_overrides[verify_service_token] = lambda: "test-token"
    app.dependency_overrides[get_evolution_analysis_service] = lambda: mock_evolution_service

    try:
        client = TestClient(app)
        payload = {
            "analyzed_commit_sha": "sha123",
            "commits": [
                {
                    "commit_sha": "sha123",
                    "message": "Update main engine",
                    "files_changed": ["src/main.py"],
                    "author_name": "Dev",
                    "author_email": "dev@example.com",
                    "committed_at": "2026-09-01T09:00:00Z",
                }
            ],
            "files": [
                {
                    "file_path": "src/main.py",
                    "content": "print('hello')",
                    "language": "python",
                }
            ],
        }

        response = client.post("/api/v1/repositories/repo-evolution-123/evolution", json=payload)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["repository_id"] == "repo-evolution-123"
        assert data["indexed_chunk_count"] == 5
        assert "Software Evolution Report" in data["markdown"]
    finally:
        app.dependency_overrides.clear()
