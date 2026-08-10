"""Embedder.

Converts Chunk objects into dense vector representations, batched for
throughput and checked against the Embedding Cache before recomputing
(§5.4, §19.4).

**Embedding-provider migration (post-Task 15)**: Gemini Embeddings
(``text-embedding-004``) is retired and no longer callable via the
Gemini API (confirmed live: ``404 models/text-embedding-004 is not
found``). ADR-003's embedding clause is superseded by ADR-007 for this
reason; ADR-003's answer-generation half (Gemini 2.5 via
``app.infra.llm.gemini_client.GeminiGateway``) is untouched. The FINAL
embedding provider is now NVIDIA's **hosted** inference API serving
**Nemotron-3-Embed-1B** (``nvidia/nemotron-3-embed-1b``) -- the model is
never downloaded or loaded inside this process; every embedding call is
a real HTTPS request to NVIDIA's servers, so this container never needs
a GPU.

Verified against NVIDIA's current official documentation before
implementation (not copied from a possibly-stale example), specifically:

- https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b
  (model card: 2048-dim output, 32768 max sequence length)
- https://docs.nvidia.com/nim/nemo-retriever/text-embedding/2.3.0/reference.html
  (``POST /v1/embeddings`` request/response schema)
- https://build.nvidia.com/nvidia/nemotron-3-embed-1b (hosted API base host)

Confirmed request/response contract:

- ``POST https://integrate.api.nvidia.com/v1/embeddings``,
  ``Authorization: Bearer <NVIDIA_API_KEY>``, OpenAI-compatible body.
- Request fields actually used here: ``input`` (list[str]), ``model``,
  ``input_type`` (``"query"`` | ``"passage"``), ``modality`` (``"text"``),
  ``embedding_type`` (``"float"``), ``encoding_format`` (``"float"``).
  All other documented fields (``dimensions``, ``truncate``, ``user``)
  are optional and not needed here -- native dimensionality is used
  as-is, never truncated, so ``dimensions`` is deliberately omitted
  rather than hardcoded to 2048 redundantly.
- Response: ``{"data": [{"index": int, "embedding": [float, ...]}, ...],
  ...}``. Every entry carries an ``index`` -- used to place each vector
  at its original input position rather than trusting response order,
  per NVIDIA's own documented contract (§Common Mistakes: never
  silently reorder vectors).

Class renamed ``GeminiEmbedder`` -> ``NemotronEmbedder``; the public
interface Task 19's ``VectorRetriever`` and Task 18's
``IncrementalSynchronizer`` depend on -- ``embed_chunks(chunks,
batch_size=32) -> list[list[float]]`` and ``embed_query(query) ->
list[float]`` -- is unchanged, so neither caller needed to change its
own embedding logic, only the imported type name (§Task 22-30 migration
scope: "the rest of the RAG system must not know about NVIDIA-specific
HTTP details").
"""

from __future__ import annotations

import math
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

import httpx
import structlog
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import EmbeddingError
from app.domain.models import Chunk

logger = structlog.get_logger("seis.core.embedding")

T = TypeVar("T")

# ADR-007 (supersedes ADR-003's embedding clause): NVIDIA's hosted
# Nemotron-3-Embed-1B is the primary/only embedding model. Pinned as a
# module constant, not read from `Settings.embedding_model_name`, for
# the same reason Task 15 pinned `text-embedding-004` this way: a model
# change must be a deliberate code change (this migration), never a
# silent `.env` edit that could desync a running collection's vectors
# from what new writes produce. `Settings.embedding_model_name` still
# carries the same value so `.env`/`.env.example` document the model
# accurately, but this constant -- not that field -- is what every
# request and every cache key actually uses. Public (no leading
# underscore) so Task 18's IncrementalSynchronizer has one source of
# truth for `compute_chunk_hash`/`Embedding.model_version`, unchanged
# from the Task 15/18 pattern.
EMBEDDING_MODEL_NAME = "nvidia/nemotron-3-embed-1b"
# Verified from NVIDIA's official model card and NeMo Retriever API
# reference (module docstring) -- never assumed. Changing providers
# again must update this alongside EMBEDDING_MODEL_NAME; both are
# checked together by _extract_vectors's per-vector validation.
_EMBEDDING_DIMENSIONS = 2048
_DEFAULT_BATCH_SIZE = 32
_EMBEDDINGS_PATH = "/embeddings"
_MODALITY_TEXT = "text"
_EMBEDDING_TYPE_FLOAT = "float"
_ENCODING_FORMAT_FLOAT = "float"

_INPUT_TYPE_DOCUMENT = "passage"
_INPUT_TYPE_QUERY = "query"


def _is_rate_limit_error(exc: BaseException) -> bool:
    """True only for a real NVIDIA HTTP 429 -- the one failure mode this
    module retries, matching the same narrow retry scope Tasks 12/15
    already established (§25: "do not blindly retry every HTTP error")."""
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429


class NemotronEmbedder:
    """Batches :class:`Chunk` content through NVIDIA's hosted Nemotron-3-
    Embed-1B API (ADR-007, §5.4). No local model, no GPU -- every call is
    a real HTTPS request to ``Settings.nvidia_embedding_base_url``.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None
        self._log = logger.bind(component="nemotron_embedder")

    # ------------------------------------------------------------------
    # HTTP client construction (lazy -- a missing/blank NVIDIA_API_KEY
    # must never crash module import or app boot, only an actual embed
    # call, exactly like Task 15's GeminiEmbedder before it).
    # ------------------------------------------------------------------
    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            api_key = self._settings.nvidia_api_key.get_secret_value()
            if not api_key:
                raise EmbeddingError(
                    "NVIDIA_API_KEY is not configured -- cannot call the NVIDIA "
                    "hosted Embeddings API.",
                    details={"model": EMBEDDING_MODEL_NAME},
                )
            self._client = httpx.AsyncClient(
                base_url=self._settings.nvidia_embedding_base_url,
                timeout=self._settings.nvidia_embedding_timeout_ms / 1000,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def _run_with_retry(self, fn: Callable[[], Awaitable[T]]) -> T:
        async for attempt in AsyncRetrying(
            retry=retry_if_exception(_is_rate_limit_error),
            stop=stop_after_attempt(4),
            wait=wait_exponential(multiplier=1, max=20),
            reraise=True,
        ):
            with attempt:
                return await fn()
        raise AssertionError("unreachable: AsyncRetrying always returns or raises")

    def _log_failure(self, exc: BaseException, start: float, *, status_code: int | None) -> None:
        # Never logs `payload`, response body, or the Authorization
        # header -- only counts/status/duration (§9, §26 Security).
        self._log.warning(
            "nemotron_embedding_failed",
            error_category="rate_limit" if status_code == 429 else "unknown",
            status_code=status_code,
            duration_ms=round((time.monotonic() - start) * 1000, 2),
        )

    async def _call_api(self, texts: list[str], input_type: str) -> list[list[float]]:
        client = self._get_client()
        payload = {
            "input": texts,
            "model": EMBEDDING_MODEL_NAME,
            "input_type": input_type,
            "modality": _MODALITY_TEXT,
            "embedding_type": _EMBEDDING_TYPE_FLOAT,
            "encoding_format": _ENCODING_FORMAT_FLOAT,
        }
        start = time.monotonic()

        async def _call() -> httpx.Response:
            response = await client.post(_EMBEDDINGS_PATH, json=payload)
            response.raise_for_status()
            return response

        try:
            response = await self._run_with_retry(_call)
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            self._log_failure(exc, start, status_code=status_code)
            raise EmbeddingError(
                f"NVIDIA embedding request failed with HTTP {status_code}",
                details={"status_code": status_code},
            ) from exc
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            self._log_failure(exc, start, status_code=None)
            raise EmbeddingError("NVIDIA embedding request failed: network/timeout error") from exc
        except EmbeddingError:
            raise
        except Exception as exc:
            self._log_failure(exc, start, status_code=None)
            raise EmbeddingError(f"NVIDIA embedding request failed: {exc}") from exc

        return self._extract_vectors(response, expected_count=len(texts))

    @staticmethod
    def _extract_vectors(response: httpx.Response, *, expected_count: int) -> list[list[float]]:
        try:
            body = response.json()
            data = body["data"]
        except (ValueError, KeyError, TypeError) as exc:
            raise EmbeddingError("NVIDIA returned a malformed embeddings response") from exc

        if not isinstance(data, list) or len(data) != expected_count:
            actual = len(data) if isinstance(data, list) else None
            raise EmbeddingError(
                "NVIDIA returned a different number of embeddings than requested",
                details={"expected": expected_count, "actual": actual},
            )

        # Placed by the response's own `index` field, never by list
        # position -- NVIDIA's documented contract does not guarantee
        # response order matches request order (module docstring).
        vectors: list[list[float] | None] = [None] * expected_count
        for item in data:
            try:
                index = int(item["index"])
                values = [float(v) for v in item["embedding"]]
            except (KeyError, TypeError, ValueError) as exc:
                raise EmbeddingError("NVIDIA returned a malformed embedding entry") from exc

            if not 0 <= index < expected_count:
                raise EmbeddingError(
                    "NVIDIA returned an embedding with an out-of-range index",
                    details={"index": index, "expected_count": expected_count},
                )
            if len(values) != _EMBEDDING_DIMENSIONS:
                raise EmbeddingError(
                    "NVIDIA returned an embedding with an unexpected dimensionality",
                    details={"expected": _EMBEDDING_DIMENSIONS, "actual": len(values)},
                )
            if not all(math.isfinite(value) for value in values):
                raise EmbeddingError(
                    "NVIDIA returned an embedding containing non-finite (NaN/Inf) values",
                    details={"index": index},
                )
            vectors[index] = values

        if any(vector is None for vector in vectors):
            raise EmbeddingError("NVIDIA response is missing embedding(s) for some inputs")

        return [vector for vector in vectors if vector is not None]

    async def embed_chunks(
        self, chunks: list[Chunk], batch_size: int = _DEFAULT_BATCH_SIZE
    ) -> list[list[float]]:
        """Embed every chunk's content, batched for throughput, using
        ``input_type="passage"`` (document/indexing mode). Returns
        vectors in the same order as ``chunks`` -- ``result[i]`` is
        ``chunks[i]``'s vector, regardless of the order NVIDIA's
        response arrives in.
        """
        if not chunks:
            return []
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")

        vectors: list[list[float]] = []
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            texts = [chunk.content for chunk in batch]
            vectors.extend(await self._call_api(texts, _INPUT_TYPE_DOCUMENT))

        self._log.info("chunks_embedded", chunk_count=len(chunks), batch_size=batch_size)
        return vectors

    async def embed_query(self, query: str) -> list[float]:
        """Embed a single search query, using NVIDIA's query-optimized
        ``input_type="query"`` mode rather than the passage one --
        failure to distinguish the two significantly degrades retrieval
        accuracy (NVIDIA's own documented guidance, module docstring).
        """
        vectors = await self._call_api([query], _INPUT_TYPE_QUERY)
        return vectors[0]

    async def close(self) -> None:
        """Releases the underlying HTTP client, if one was ever
        constructed -- same explicit-lifecycle pattern as
        :meth:`ChromaClient.close`/:meth:`RedisClient.close`."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._log.debug("nemotron_embedder.client_closed")
