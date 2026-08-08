"""Unit tests for app/core/embedding/embedder.py (Task 15).

Mirrors tests/unit/test_gemini_client.py's approach: a minimal fake
standing in for the `google.genai` SDK's async client, with rate-limit
scenarios using *real* `google.genai.errors` exception instances built
from a real `requests.Response`. Live-API verification (an actual
Gemini embedding call) is covered separately by
tests/integration/test_embedder_integration.py, gated on a real API key
-- same reasoning as Task 12, since there is no local, free substitute
for the Gemini API itself.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
import requests
from google import genai  # type: ignore[import-untyped]
from google.genai import errors as genai_errors  # type: ignore[import-untyped]

from app.config.settings import Settings
from app.core.embedding.embedder import GeminiEmbedder
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import EmbeddingError
from app.domain.models import Chunk, ChunkMetadata


def _make_api_error(code: int, message: str) -> genai_errors.ClientError:
    response = requests.Response()
    response.status_code = code
    response._content = f'{{"error": {{"message": "{message}"}}}}'.encode()
    return genai_errors.ClientError(code, response)


def _chunk(chunk_id: str, content: str) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content=content,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path="src/app.py",
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )


class FakeContentEmbedding:
    def __init__(self, values: list[float]) -> None:
        self.values = values


class FakeEmbedResponse:
    def __init__(self, embeddings: list[FakeContentEmbedding]) -> None:
        self.embeddings = embeddings


class FakeModels:
    def __init__(self) -> None:
        self.embed_content_calls: list[dict[str, Any]] = []
        self.embed_content_errors: list[Exception] = []
        self.embed_content_delay = 0.0
        self.vector_dimensions = 768

    async def embed_content(self, *, model: str, contents: Any, config: Any) -> FakeEmbedResponse:
        self.embed_content_calls.append({"model": model, "contents": contents, "config": config})
        if self.embed_content_delay:
            await asyncio.sleep(self.embed_content_delay)
        if self.embed_content_errors:
            raise self.embed_content_errors.pop(0)
        count = len(contents) if isinstance(contents, list) else 1
        embeddings = [FakeContentEmbedding([0.1] * self.vector_dimensions) for _ in range(count)]
        return FakeEmbedResponse(embeddings)


class FakeAio:
    def __init__(self, models: FakeModels) -> None:
        self.models = models


class FakeGenaiClient:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key
        self.models = FakeModels()
        self.aio = FakeAio(self.models)


@pytest.fixture
def fake_genai(monkeypatch: pytest.MonkeyPatch) -> dict[str, FakeGenaiClient]:
    holder: dict[str, FakeGenaiClient] = {}

    def _client_factory(api_key: str | None = None) -> FakeGenaiClient:
        instance = FakeGenaiClient(api_key=api_key)
        holder["client"] = instance
        return instance

    monkeypatch.setattr(genai, "Client", _client_factory)
    return holder


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {"gemini_api_key": "fake-test-key"}
    defaults.update(overrides)
    return Settings(**defaults)


# ---------------------------------------------------------------------------
# Lazy construction / missing API key
# ---------------------------------------------------------------------------
async def test_missing_api_key_raises_embeddingerror_without_constructing_client(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings(gemini_api_key=""))
    with pytest.raises(EmbeddingError, match="GEMINI_API_KEY is not configured"):
        await embedder.embed_query("hello")
    assert "client" not in fake_genai


async def test_client_is_constructed_lazily_and_reused_across_calls(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    assert embedder._client is None

    await embedder.embed_query("first")
    first_client = embedder._client
    assert first_client is not None

    await embedder.embed_query("second")
    assert embedder._client is first_client
    assert len(fake_genai) == 1


# ---------------------------------------------------------------------------
# embed_chunks
# ---------------------------------------------------------------------------
async def test_embed_chunks_returns_vectors_in_input_order(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    chunks = [_chunk("c1", "def a(): ..."), _chunk("c2", "def b(): ...")]

    vectors = await embedder.embed_chunks(chunks)

    assert len(vectors) == 2
    assert all(len(v) == 768 for v in vectors)

    call = fake_genai["client"].models.embed_content_calls[0]
    assert call["model"] == "text-embedding-004"
    assert call["contents"] == ["def a(): ...", "def b(): ..."]
    assert call["config"].task_type == "RETRIEVAL_DOCUMENT"


async def test_embed_chunks_splits_into_batches_of_the_given_size(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    chunks = [_chunk(f"c{i}", f"content {i}") for i in range(5)]

    vectors = await embedder.embed_chunks(chunks, batch_size=2)

    assert len(vectors) == 5
    calls = fake_genai["client"].models.embed_content_calls
    assert len(calls) == 3  # batches of 2, 2, 1
    assert [len(c["contents"]) for c in calls] == [2, 2, 1]


async def test_embed_chunks_with_empty_list_returns_empty_without_calling_client(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    result = await embedder.embed_chunks([])
    assert result == []
    assert "client" not in fake_genai


async def test_embed_chunks_rejects_non_positive_batch_size(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    with pytest.raises(ValueError, match="batch_size must be positive"):
        await embedder.embed_chunks([_chunk("c1", "x")], batch_size=0)


# ---------------------------------------------------------------------------
# embed_query
# ---------------------------------------------------------------------------
async def test_embed_query_uses_retrieval_query_task_type(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    vector = await embedder.embed_query("how does auth work?")

    assert len(vector) == 768
    call = fake_genai["client"].models.embed_content_calls[0]
    assert call["contents"] == ["how does auth work?"]
    assert call["config"].task_type == "RETRIEVAL_QUERY"


# ---------------------------------------------------------------------------
# Dimension validation
# ---------------------------------------------------------------------------
async def test_wrong_dimensionality_raises_embeddingerror(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    await embedder.embed_query("warm-up")
    fake_genai["client"].models.vector_dimensions = 384

    with pytest.raises(EmbeddingError, match="unexpected dimensionality"):
        await embedder.embed_query("prompt")


# ---------------------------------------------------------------------------
# 429 rate-limit retry
# ---------------------------------------------------------------------------
async def test_rate_limit_429_retries_then_succeeds(fake_genai: dict[str, FakeGenaiClient]) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    await embedder.embed_query("warm-up")
    models = fake_genai["client"].models
    models.embed_content_errors = [
        _make_api_error(429, "rate limited"),
        _make_api_error(429, "rate limited"),
    ]

    vector = await embedder.embed_query("prompt")

    assert len(vector) == 768
    assert len(models.embed_content_calls) == 4  # warm-up + 2 failed + 1 succeeded


async def test_rate_limit_429_exhausts_retries_and_raises_embeddingerror(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    await embedder.embed_query("warm-up")
    models = fake_genai["client"].models
    models.embed_content_errors = [_make_api_error(429, "rate limited") for _ in range(10)]

    with pytest.raises(EmbeddingError) as exc_info:
        await embedder.embed_query("prompt")

    assert isinstance(exc_info.value.__cause__, genai_errors.ClientError)


# ---------------------------------------------------------------------------
# Non-429 errors: translated once, never retried
# ---------------------------------------------------------------------------
async def test_non_rate_limit_client_error_translated_without_retry(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    await embedder.embed_query("warm-up")
    models = fake_genai["client"].models
    models.embed_content_errors = [_make_api_error(400, "bad request")]

    with pytest.raises(EmbeddingError) as exc_info:
        await embedder.embed_query("prompt")

    assert exc_info.value.details["status_code"] == 400
    assert len(models.embed_content_calls) == 2  # warm-up + exactly one failed attempt


async def test_generic_exception_translated_to_embeddingerror(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings())
    await embedder.embed_query("warm-up")
    fake_genai["client"].models.embed_content_errors = [RuntimeError("unexpected SDK failure")]

    with pytest.raises(EmbeddingError, match="embedding request failed"):
        await embedder.embed_query("prompt")


# ---------------------------------------------------------------------------
# Timeout enforcement
# ---------------------------------------------------------------------------
async def test_slow_call_is_translated_to_embeddingerror_via_timeout(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    embedder = GeminiEmbedder(settings=_settings(gemini_timeout_ms=20))
    await embedder.embed_query("warm-up")
    fake_genai["client"].models.embed_content_delay = 0.5

    with pytest.raises(EmbeddingError, match="embedding request failed"):
        await embedder.embed_query("prompt")
