"""Unit tests for ExpressCallbackClient."""

import pytest
from unittest.mock import AsyncMock, patch
import httpx

from app.config.settings import Settings
from app.infra.http.express_client import ExpressCallbackClient


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        express_base_url="http://localhost:5000",
        internal_api_key="test-secret-key",
    )


@pytest.mark.asyncio
async def test_send_status_update_success(test_settings: Settings) -> None:
    client = ExpressCallbackClient(settings=test_settings)
    
    mock_response = httpx.Response(200, json={"success": True})
    
    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        
        result = await client.send_status_update(
            repository_id="repo-123",
            status="READY",
            stage="INDEXING",
            chunk_count=42,
            file_count=10,
            job_id="job-99",
        )
        
        assert result is True
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        payload = call_kwargs["json"]
        assert payload["repository_id"] == "repo-123"
        assert payload["status"] == "READY"
        assert payload["stage"] == "INDEXING"
        assert payload["chunk_count"] == 42
        assert payload["file_count"] == 10
        assert payload["job_id"] == "job-99"

    await client.close()


@pytest.mark.asyncio
async def test_send_status_update_handles_failure(test_settings: Settings) -> None:
    client = ExpressCallbackClient(settings=test_settings)
    
    with patch.object(httpx.AsyncClient, "post", side_effect=httpx.ConnectError("Connection refused")):
        result = await client.send_status_update(
            repository_id="repo-123",
            status="FAILED",
            error="Processing failed",
        )
        
        assert result is False

    await client.close()
