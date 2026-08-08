"""Embedder.

Converts Chunk objects into dense vector representations, batched for
throughput and checked against the Embedding Cache before recomputing
(§5.4, §19.4).

Task 15: ``GeminiEmbedder`` -- batches text chunks through Gemini
Embeddings (``text-embedding-004``, 768-dimensional, ADR-003) via the
``google-genai`` SDK. Scoped exactly to this task's own ``Dependencies``
line (``google-genai``, ``app.config``, ``app.domain``): it builds its
own ``genai.Client`` rather than reusing ``app.infra.llm.gemini_client
.GeminiGateway`` (that adapter has no embedding method, and Task 15
explicitly names ``GeminiEmbedder`` initializing its own client as
subtask 1).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

import structlog
from google import genai  # type: ignore[import-untyped]
from google.genai import errors as genai_errors  # type: ignore[import-untyped]
from google.genai import types as genai_types
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import EmbeddingError
from app.domain.models import Chunk

logger = structlog.get_logger("seis.core.embedding")

T = TypeVar("T")

# ADR-003 (frozen): Gemini Embeddings `text-embedding-004` is the
# primary embedding model. Deliberately NOT `Settings.embedding_model_name`
# -- that field's frozen `.env.example` default (`all-MiniLM-L6-v2`) is
# a Sentence Transformers model name for the *optional local fallback*
# ADR-003 mentions, not something valid to pass to the Gemini API. This
# constant is the one genuinely usable per ADR-003's decision and Task
# 15's own Review Checklist ("Model set to text-embedding-004").
_EMBEDDING_MODEL_NAME = "text-embedding-004"
_EMBEDDING_DIMENSIONS = 768
_DEFAULT_BATCH_SIZE = 32

_TASK_TYPE_DOCUMENT = "RETRIEVAL_DOCUMENT"
_TASK_TYPE_QUERY = "RETRIEVAL_QUERY"


def _is_rate_limit_error(exc: BaseException) -> bool:
    return isinstance(exc, genai_errors.ClientError) and getattr(exc, "code", None) == 429


class GeminiEmbedder:
    """Batches :class:`Chunk` content through Gemini Embeddings
    (Task 15, §5.4, ADR-003).
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: genai.Client | None = None
        self._log = logger.bind(component="gemini_embedder")

    def _get_client(self) -> genai.Client:
        if self._client is None:
            api_key = self._settings.gemini_api_key.get_secret_value()
            if not api_key:
                raise EmbeddingError(
                    "GEMINI_API_KEY is not configured -- cannot call the Gemini Embeddings API.",
                    details={"model": _EMBEDDING_MODEL_NAME},
                )
            self._client = genai.Client(api_key=api_key)
        return self._client

    async def _run_with_retry(self, fn: Callable[[], Awaitable[T]]) -> T:
        # Same narrow retry scope as Task 12's GeminiGateway: only a
        # real HTTP 429 is retried; every other failure translates once.
        timeout_seconds = self._settings.gemini_timeout_ms / 1000
        async for attempt in AsyncRetrying(
            retry=retry_if_exception(_is_rate_limit_error),
            stop=stop_after_attempt(4),
            wait=wait_exponential(multiplier=1, max=20),
            reraise=True,
        ):
            with attempt:
                return await asyncio.wait_for(fn(), timeout=timeout_seconds)
        raise AssertionError("unreachable: AsyncRetrying always returns or raises")

    async def _embed_batch(self, texts: list[str], task_type: str) -> list[list[float]]:
        client = self._get_client()
        config = genai_types.EmbedContentConfig(task_type=task_type)

        async def _call() -> genai_types.EmbedContentResponse:
            return await client.aio.models.embed_content(
                model=_EMBEDDING_MODEL_NAME, contents=texts, config=config
            )

        start = time.monotonic()
        try:
            response = await self._run_with_retry(_call)
        except genai_errors.ClientError as exc:
            self._log_failure(exc, start, rate_limited=_is_rate_limit_error(exc))
            raise EmbeddingError(
                f"Gemini embedding request failed: {exc}",
                details={"status_code": getattr(exc, "code", None)},
            ) from exc
        except Exception as exc:
            self._log_failure(exc, start, rate_limited=False)
            raise EmbeddingError(f"Gemini embedding request failed: {exc}") from exc

        return self._extract_vectors(response)

    def _log_failure(self, exc: Exception, start: float, *, rate_limited: bool) -> None:
        self._log.warning(
            "gemini_embedding_failed",
            error_category="rate_limit" if rate_limited else "unknown",
            duration_ms=round((time.monotonic() - start) * 1000, 2),
        )

    @staticmethod
    def _extract_vectors(response: genai_types.EmbedContentResponse) -> list[list[float]]:
        vectors: list[list[float]] = []
        for embedding in response.embeddings or []:
            values = list(embedding.values or [])
            if len(values) != _EMBEDDING_DIMENSIONS:
                raise EmbeddingError(
                    "Gemini returned an embedding with an unexpected dimensionality",
                    details={"expected": _EMBEDDING_DIMENSIONS, "actual": len(values)},
                )
            vectors.append(values)
        return vectors

    async def embed_chunks(
        self, chunks: list[Chunk], batch_size: int = _DEFAULT_BATCH_SIZE
    ) -> list[list[float]]:
        """Embed every chunk's content, batched for throughput. Returns
        vectors in the same order as ``chunks`` -- ``result[i]`` is
        ``chunks[i]``'s vector.
        """
        if not chunks:
            return []
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")

        vectors: list[list[float]] = []
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            texts = [chunk.content for chunk in batch]
            vectors.extend(await self._embed_batch(texts, _TASK_TYPE_DOCUMENT))

        self._log.info("chunks_embedded", chunk_count=len(chunks), batch_size=batch_size)
        return vectors

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single search query, using Gemini's query-optimized
        task type rather than the document one (§5.4 Best Practices).
        """
        vectors = await self._embed_batch([query], _TASK_TYPE_QUERY)
        return vectors[0]
