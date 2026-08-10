"""Unit tests for app/core/embedding/embedder.py (NVIDIA Nemotron migration).

Uses a real `NemotronEmbedder` instance whose underlying `httpx.AsyncClient`
is built with `httpx.MockTransport` -- this exercises the module's *real*
request-construction, header, retry, and response-parsing logic against a
fully deterministic fake HTTP server, rather than monkeypatching around
that logic (the same "construct real instances, substitute the minimum
necessary for determinism" philosophy already used throughout this
codebase, adapted to an httpx-based adapter instead of an SDK-based one).
Live-API verification (an actual NVIDIA embedding call) is covered
separately by tests/integration/test_embedder_integration.py, gated on a
real NVIDIA_API_KEY -- same reasoning as Task 12/15's Gemini tests, since
there is no local, free substitute for a hosted inference API.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import EMBEDDING_MODEL_NAME, NemotronEmbedder
from app.core.embedding.embedding_cache import compute_chunk_hash
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import EmbeddingError
from app.domain.models import Chunk, ChunkMetadata

_DIM = 2048


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {"nvidia_api_key": "fake-test-key"}
    defaults.update(overrides)
    return Settings(**defaults)


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


def _vector(fill: float = 0.1) -> list[float]:
    return [fill] * _DIM


def _embed_response(
    vectors: list[list[float]], indices: list[int] | None = None, *, status_code: int = 200
) -> httpx.Response:
    order = indices if indices is not None else list(range(len(vectors)))
    body = {
        "object": "list",
        "data": [
            {"object": "embedding", "index": i, "embedding": v}
            for i, v in zip(order, vectors, strict=True)
        ],
        "model": EMBEDDING_MODEL_NAME,
        "usage": {"prompt_tokens": 1, "total_tokens": 1},
    }
    return httpx.Response(
        status_code,
        content=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
    )


def _embedder_with_transport(
    handler: Callable[[httpx.Request], httpx.Response], settings: Settings | None = None
) -> NemotronEmbedder:
    """Builds a real `NemotronEmbedder` whose lazily-constructed HTTP
    client is pre-seeded with a `MockTransport` -- `_get_client()`'s own
    api-key check and header/base-url construction still run normally
    the first time a public method is awaited would call it, but here we
    bypass that by assigning `_client` directly (mirroring how a real
    call would leave it), since we want the transport substituted, not
    the client-construction logic itself."""
    embedder = NemotronEmbedder(settings=settings or _settings())
    embedder._client = httpx.AsyncClient(
        base_url=embedder._settings.nvidia_embedding_base_url,
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer fake-test-key", "Content-Type": "application/json"},
    )
    return embedder


def _request_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content)  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Lazy construction / missing API key
# ---------------------------------------------------------------------------
async def test_missing_api_key_raises_embeddingerror_without_making_a_request() -> None:
    embedder = NemotronEmbedder(settings=_settings(nvidia_api_key=""))
    with pytest.raises(EmbeddingError, match="NVIDIA_API_KEY is not configured"):
        await embedder.embed_query("hello")
    assert embedder._client is None


async def test_client_is_constructed_lazily_and_reused_across_calls() -> None:
    embedder = NemotronEmbedder(settings=_settings())
    assert embedder._client is None

    def handler(request: httpx.Request) -> httpx.Response:
        return _embed_response([_vector()])

    embedder._client = httpx.AsyncClient(
        base_url=embedder._settings.nvidia_embedding_base_url,
        transport=httpx.MockTransport(handler),
    )
    first_client = embedder._client
    await embedder.embed_query("first")
    await embedder.embed_query("second")
    assert embedder._client is first_client


# ---------------------------------------------------------------------------
# API request construction (§27)
# ---------------------------------------------------------------------------
async def test_embed_chunks_sends_the_documented_request_shape() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _embed_response([_vector(), _vector()])

    embedder = _embedder_with_transport(handler)
    chunks = [_chunk("c1", "def a(): ..."), _chunk("c2", "def b(): ...")]

    vectors = await embedder.embed_chunks(chunks)

    assert len(vectors) == 2
    assert all(len(v) == _DIM for v in vectors)

    request = captured[0]
    assert request.method == "POST"
    # Full path must resolve to the verified real endpoint
    # https://integrate.api.nvidia.com/v1/embeddings -- base_url already
    # includes `/v1`, so this confirms the two join correctly.
    assert request.url.path == "/v1/embeddings"
    body = _request_body(request)
    assert body["input"] == ["def a(): ...", "def b(): ..."]
    assert body["model"] == EMBEDDING_MODEL_NAME == "nvidia/nemotron-3-embed-1b"
    assert body["input_type"] == "passage"
    assert body["modality"] == "text"
    assert body["embedding_type"] == "float"
    assert body["encoding_format"] == "float"


async def test_embed_query_uses_query_input_type() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _embed_response([_vector()])

    embedder = _embedder_with_transport(handler)
    vector = await embedder.embed_query("how does auth work?")

    assert len(vector) == _DIM
    body = _request_body(captured[0])
    assert body["input"] == ["how does auth work?"]
    assert body["input_type"] == "query"


# ---------------------------------------------------------------------------
# Authentication (§9, §26)
# ---------------------------------------------------------------------------
async def test_authorization_header_is_a_bearer_token_from_settings() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _embed_response([_vector()])

    embedder = NemotronEmbedder(settings=_settings(nvidia_api_key="real-looking-key-123"))
    # Let `_get_client()` build the client for real (exercises the actual
    # header-construction code path), then swap only the transport.
    client = embedder._get_client()
    client._transport = httpx.MockTransport(handler)

    await embedder.embed_query("hello")

    auth_header = captured[0].headers.get("authorization")
    assert auth_header == "Bearer real-looking-key-123"


# ---------------------------------------------------------------------------
# Batching (§10, §27)
# ---------------------------------------------------------------------------
async def test_embed_chunks_splits_into_batches_of_the_given_size() -> None:
    calls: list[list[str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        texts = _request_body(request)["input"]
        calls.append(texts)
        return _embed_response([_vector() for _ in texts])

    embedder = _embedder_with_transport(handler)
    chunks = [_chunk(f"c{i}", f"content {i}") for i in range(5)]

    vectors = await embedder.embed_chunks(chunks, batch_size=2)

    assert len(vectors) == 5
    assert len(calls) == 3  # batches of 2, 2, 1
    assert [len(c) for c in calls] == [2, 2, 1]


async def test_embed_chunks_with_empty_list_returns_empty_without_a_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not be called for an empty chunk list")

    embedder = _embedder_with_transport(handler)
    assert await embedder.embed_chunks([]) == []


async def test_embed_chunks_rejects_non_positive_batch_size() -> None:
    embedder = _embedder_with_transport(lambda r: _embed_response([_vector()]))
    with pytest.raises(ValueError, match="batch_size must be positive"):
        await embedder.embed_chunks([_chunk("c1", "x")], batch_size=0)


# ---------------------------------------------------------------------------
# Output ordering -- never trust response list order, always use `index`
# ---------------------------------------------------------------------------
async def test_vectors_are_placed_by_response_index_not_response_order() -> None:
    marker_vectors = [_vector(0.0), _vector(1.0), _vector(2.0)]

    def handler(request: httpx.Request) -> httpx.Response:
        # NVIDIA returns entries out of order relative to the request.
        return _embed_response(marker_vectors, indices=[2, 0, 1])

    embedder = _embedder_with_transport(handler)
    chunks = [_chunk("c0", "zero"), _chunk("c1", "one"), _chunk("c2", "two")]

    vectors = await embedder.embed_chunks(chunks)

    assert vectors[0][0] == 1.0  # index 0's embedding
    assert vectors[1][0] == 2.0  # index 1's embedding
    assert vectors[2][0] == 0.0  # index 2's embedding


# ---------------------------------------------------------------------------
# Dimension validation (§12) -- never assume 768, never pad/truncate
# ---------------------------------------------------------------------------
async def test_wrong_dimensionality_raises_embeddingerror() -> None:
    embedder = _embedder_with_transport(lambda r: _embed_response([[0.1] * 384]))
    with pytest.raises(EmbeddingError, match="unexpected dimensionality"):
        await embedder.embed_query("prompt")


async def test_non_finite_values_in_response_raise_embeddingerror() -> None:
    bad_vector = [0.1] * (_DIM - 1) + [float("nan")]

    def handler(request: httpx.Request) -> httpx.Response:
        return _embed_response([bad_vector])

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="non-finite"):
        await embedder.embed_query("prompt")


# ---------------------------------------------------------------------------
# Malformed response handling (§25)
# ---------------------------------------------------------------------------
async def test_response_missing_data_key_raises_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"object": "list"})

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="malformed embeddings response"):
        await embedder.embed_query("prompt")


async def test_response_entry_missing_embedding_field_raises_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"object": "embedding", "index": 0}]})

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="malformed embedding entry"):
        await embedder.embed_query("prompt")


async def test_response_with_fewer_entries_than_requested_raises_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        texts = _request_body(request)["input"]
        # Only return one embedding for two requested inputs.
        return (
            _embed_response([_vector()], indices=[0])
            if len(texts) == 2
            else _embed_response([_vector()])
        )

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="different number of embeddings"):
        await embedder.embed_chunks([_chunk("c1", "a"), _chunk("c2", "b")])


# ---------------------------------------------------------------------------
# HTTP error handling (§25)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status_code", [400, 401, 403, 500, 503])
async def test_http_error_status_codes_are_translated_to_embeddingerror(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": {"message": "provider error"}})

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError) as exc_info:
        await embedder.embed_query("prompt")

    assert exc_info.value.details["status_code"] == status_code
    # The raw provider exception must never cross the boundary.
    assert not isinstance(exc_info.value, httpx.HTTPStatusError)


async def test_network_failure_is_translated_to_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="network/timeout"):
        await embedder.embed_query("prompt")


async def test_timeout_is_translated_to_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out", request=request)

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError, match="network/timeout"):
        await embedder.embed_query("prompt")


# ---------------------------------------------------------------------------
# Retry behavior -- only 429 is retried (§25: "do not blindly retry
# every HTTP error")
# ---------------------------------------------------------------------------
async def test_rate_limit_429_retries_then_succeeds() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(429, json={"error": "rate limited"})
        return _embed_response([_vector()])

    embedder = _embedder_with_transport(handler)
    vector = await embedder.embed_query("prompt")

    assert len(vector) == _DIM
    assert call_count == 3


async def test_rate_limit_429_exhausts_retries_and_raises_embeddingerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate limited"})

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError) as exc_info:
        await embedder.embed_query("prompt")

    assert exc_info.value.details["status_code"] == 429


async def test_non_429_client_error_is_translated_without_retry() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(400, json={"error": "bad request"})

    embedder = _embedder_with_transport(handler)
    with pytest.raises(EmbeddingError):
        await embedder.embed_query("prompt")

    assert call_count == 1  # never retried


# ---------------------------------------------------------------------------
# Cache invalidation across providers (§14, §17) -- switching from the
# retired Gemini model to Nemotron must never collide with old cache keys.
# ---------------------------------------------------------------------------
def test_embedding_model_name_differs_from_the_retired_gemini_model() -> None:
    assert EMBEDDING_MODEL_NAME == "nvidia/nemotron-3-embed-1b"
    assert EMBEDDING_MODEL_NAME != "text-embedding-004"


def test_switching_providers_changes_the_cache_hash_for_identical_content() -> None:
    content = "def foo(): ...\n"
    gemini_hash = compute_chunk_hash(content, "text-embedding-004")
    nemotron_hash = compute_chunk_hash(content, EMBEDDING_MODEL_NAME)
    assert gemini_hash != nemotron_hash
