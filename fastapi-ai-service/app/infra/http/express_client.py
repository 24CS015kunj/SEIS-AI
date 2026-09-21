"""Express Client.

Outbound HTTP client used for processing-status callbacks to Express
(§11.2, §6.1). The only module permitted to call back into Express.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog

from app.config.settings import Settings

logger = structlog.get_logger("seis.infra.express_client")

_INGESTION_STATUS_WEBHOOK_PATH = "/api/webhooks/fastapi/ingestion-status"


class ExpressCallbackClient:
    """Outbound HTTP client for sending async job lifecycle notifications to Express."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None
        self._log = logger.bind(component="express_callback_client")

    def _get_client(self) -> httpx.AsyncClient:
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self._client is not None:
            client_loop = getattr(self, "_created_loop", None)
            if client_loop is not None and (
                client_loop.is_closed()
                or (current_loop is not None and client_loop is not current_loop)
            ):
                self._client = None

        if self._client is None:
            headers = {"Content-Type": "application/json"}
            api_key = self._settings.internal_api_key.get_secret_value()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            self._client = httpx.AsyncClient(
                base_url=self._settings.express_base_url,
                timeout=10.0,
                headers=headers,
            )
            self._created_loop = current_loop
        return self._client

    async def send_status_update(
        self,
        repository_id: str,
        status: str,
        stage: str | None = None,
        chunk_count: int = 0,
        file_count: int = 0,
        error: str | None = None,
        job_id: str | None = None,
    ) -> bool:
        """Sends an ingestion processing status callback to Express gateway."""
        payload: dict[str, Any] = {
            "repository_id": repository_id,
            "job_id": job_id,
            "status": status,
            "stage": stage,
            "chunk_count": chunk_count,
            "file_count": file_count,
            "error": error,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        client = self._get_client()
        url = _INGESTION_STATUS_WEBHOOK_PATH

        self._log.info(
            "express_callback.sending_status",
            repository_id=repository_id,
            status=status,
            stage=stage,
        )

        for attempt in range(2):
            try:
                response = await client.post(url, json=payload)
                if response.status_code < 400:
                    self._log.info(
                        "express_callback.success",
                        repository_id=repository_id,
                        status_code=response.status_code,
                    )
                    return True
                self._log.warning(
                    "express_callback.non_2xx",
                    repository_id=repository_id,
                    status_code=response.status_code,
                    attempt=attempt + 1,
                )
            except Exception as exc:
                self._log.warning(
                    "express_callback.failed",
                    repository_id=repository_id,
                    error=str(exc),
                    attempt=attempt + 1,
                )

        return False

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

