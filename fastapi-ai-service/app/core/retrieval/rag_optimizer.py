"""RAG Optimization Engine (Query Expansion & Cross-Encoder Reranking).

Task 24 (Phase 4, final task): improves retrieval precision two ways --
expanding a user's query into a small set of variants before retrieval
(§20), and re-scoring an initial top-N candidate set with a real
cross-encoder before it reaches Task 21's Context Builder (Architecture
Reasoning: vector similarity alone sometimes ranks keyword-heavy
irrelevancies above semantically deep code chunks).

Reranker provider decision: no reranking library existed anywhere in
this codebase before this task, and "Cross-Encoder reranker" has real
architectural weight -- a local ``sentence-transformers`` cross-encoder
would add a new multi-hundred-MB dependency and contradict the
no-local-model/no-GPU pattern ADR-007 established for embeddings. Per
explicit user direction, this task reuses that same pattern instead:
NVIDIA's **hosted** NIM reranking API, called over HTTPS, no local
model, no GPU.

Endpoint verification: initial research (NVIDIA's self-hosted NIM
container docs, which describe the same request/response *schema* the
hosted API also serves) pointed at a unified ``POST
https://integrate.api.nvidia.com/v1/ranking`` path -- the same host
already used for embeddings (Task 15/ADR-007). That path was tried
against the real, live API before this module was considered done and
returned a real ``404``; it is **not** this model's actual hosted
endpoint. The correct endpoint was found by testing candidates directly
against NVIDIA's live API (not by further speculative doc-reading) and
confirmed working:

- **Model**: ``nvidia/llama-nemotron-rerank-vl-1b-v2`` --
  https://build.nvidia.com/nvidia/llama-nemotron-rerank-vl-1b-v2 .
  **Task 60 update**: the previously-verified
  ``nvidia/llama-nemotron-rerank-1b-v2`` (used since this module's
  original implementation) returned a real, live ``410 Gone``
  ("This endpoint has reached its end of life on 2026-08-25") when
  re-verified during Task 60 -- the exact same deprecation pattern this
  module's own history already saw twice before (``llama-3.2-nv-
  rerankqa-1b-v2`` EOL 2026-05-18, ``nv-rerankqa-mistral-4b-v3``
  deprecated). ``llama-nemotron-rerank-vl-1b-v2`` is its direct
  architectural successor -- NVIDIA's own documentation confirms it
  embeds the retired text-only model as its language component and
  "incorporates the text-only reranking capabilities of its
  predecessor" -- and was live-verified (Task 60) to correctly rank a
  relevant code passage above an irrelevant one via the exact same
  request/response schema documented below; nothing in
  ``_call_reranking_api``/``_extract_logits`` needed to change, only
  this constant and ``_RANKING_PATH``.
- **Endpoint** (verified live, HTTP 200): ``POST
  https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking``
  -- a *different host* (``ai.api.nvidia.com``, not
  ``integrate.api.nvidia.com``) and a per-model path, not the unified
  ``/v1/ranking`` path newer NIM endpoints (including embeddings) use.
  ``Settings.nvidia_reranking_base_url`` holds the host; the model-
  specific path segment is a code constant here (``_RANKING_PATH``),
  same "a model change is a deliberate code change" reasoning as
  ``EMBEDDING_MODEL_NAME``/``RERANKING_MODEL_NAME`` below.
- **Auth**: ``Authorization: Bearer <NVIDIA_API_KEY>`` -- confirmed
  live, same key already used for embeddings.
- **Request body** (verified live): ``model`` is required (a live call
  omitting it returns ``400``); ``query: {"text": str}``; ``passages:
  [{"text": str}, ...]``; ``truncate`` is optional (a live call omitting
  it still returns ``200``) but included here anyway (``"END"``) since
  it is a documented, harmless-to-set field.
- **Response** (verified live): ``{"rankings": [{"index": int, "logit":
  float}, ...], "usage": {...}}``. Confirmed live that ``rankings`` is
  already sorted descending by ``logit`` -- this module re-sorts
  independently anyway rather than depending on that being permanently
  true, the same never-trust-response-order posture ``embedder.py``
  already applies to its own ``index`` field.
- ``Settings.nvidia_embedding_timeout_ms`` is reused for the request
  timeout -- one more hosted NVIDIA HTTP call, no new per-call
  characteristic that would justify a dedicated setting.

Score reconciliation: the response field is named ``logit`` -- a raw,
unbounded pre-sigmoid cross-encoder score, not a ``[0, 1]`` similarity.
The frozen Task 7 :class:`SearchResultItem`'s ``score`` field requires
``0.0 <= score <= 1.0``, so each logit is passed through a numerically
stable sigmoid before being written back, exactly the transform the
model was trained under (a cross-attention relevance classifier's
logit). This new score *replaces* the incoming vector-similarity score
rather than blending with it -- the cross-encoder's whole purpose is to
be a more accurate (if more expensive) relevance judgment than the
first-pass bi-encoder score it supersedes.

Query expansion (subtask 2) has no LLM/embedding dependency in this
task's own spec (``Dependencies: app.core.retrieval.retriever,
app.domain`` -- no Gemini/NVIDIA gateway listed), so it is implemented
as cheap, deterministic, dependency-free heuristics rather than an LLM
call: splitting camelCase/snake_case/kebab-case identifiers into words
(code-search recall) and stripping a small set of common
question-lead-in phrases (keyword-search recall) -- not a synonym
thesaurus, which would require a new data dependency nothing in this
codebase provides.

``RetrievedChunk`` naming reconciliation: the same one Task 21 already
made for its own signature -- no such model exists; the frozen Task 7
``SearchResultItem`` (``chunk_id``, ``content``, ``score``,
``metadata``) is used as-is, both as ``rerank_chunks``'s input and
output type.

Candidate-set bounding (Best Practices: "keep reranking candidate set
size small... to maintain low latency" / Common Mistakes: "running
expensive cross-encoders on large chunk candidate sets"): this module
reranks whatever candidate list its caller passes in -- it does not
itself call the retriever, so the *caller* (a future Phase 6 service)
is responsible for requesting a bounded candidate set (e.g. top-20)
from :class:`VectorRetriever` before calling ``rerank_chunks``, per
this task's own "top-20 in, top-5 out" responsibility split.
"""

from __future__ import annotations

import math
import re
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

import httpx
import structlog
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import RerankError
from app.domain.models import SearchResultItem

logger = structlog.get_logger("seis.core.retrieval")

T = TypeVar("T")

# Verified current, non-deprecated hosted NVIDIA reranking model --
# module docstring (Task 60: the prior model this constant pinned,
# nvidia/llama-nemotron-rerank-1b-v2, reached end-of-life 2026-08-25).
# Public (no leading underscore), same reasoning as embedder.py's
# EMBEDDING_MODEL_NAME: a model change is a deliberate code change, not
# a silent .env edit.
RERANKING_MODEL_NAME = "nvidia/llama-nemotron-rerank-vl-1b-v2"
# Per-model path, verified live (module docstring) -- unlike embeddings'
# shared /v1/embeddings path, this hosted API routes by model in the URL
# itself, not only via the request body's "model" field.
_RANKING_PATH = "/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking"
_TRUNCATE_MODE = "END"
_DEFAULT_TOP_K = 5
# File-diversity cap (Task 60) -- see `rerank_chunks`'s own docstring for
# the real evidence this was added in response to. 1, not 2 or more: a
# real test against this repository showed a cap of 2 still let three
# distinct files fill all 5 slots before the cross-encoder's own
# ordering ever reached the one chunk from the file the question was
# actually about -- only a strict per-file cap of 1 reliably surfaced it
# while every multi-file case tested (4 of 8 real question categories)
# stayed correct or improved.
_DEFAULT_MAX_CHUNKS_PER_FILE = 1

# Splits camelCase word boundaries (lower/digit -> upper) for code-search
# recall, e.g. "getUserById" -> "get User By Id" (further normalized to
# single spaces alongside snake_case/kebab-case below).
_CAMEL_CASE_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_WHITESPACE_RUN = re.compile(r"\s+")

# Common question lead-ins stripped to surface the core keyword phrase
# as a second query variant. Matched case-insensitively at the start of
# the query only. Ordered longest-first is not required -- each is
# tried independently and at most one is stripped.
_FILLER_PREFIXES = (
    "how does ",
    "how do ",
    "how can ",
    "what is ",
    "what are ",
    "explain ",
    "show me ",
    "tell me about ",
)


def _is_rate_limit_error(exc: BaseException) -> bool:
    """True only for a real NVIDIA HTTP 429 -- the one failure mode this
    module retries, the same narrow retry scope Tasks 12/15 established."""
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429


def _sigmoid(x: float) -> float:
    """Numerically stable logistic sigmoid -- converts a raw cross-encoder
    logit into a ``(0, 1)`` relevance probability without overflowing
    ``math.exp`` for large-magnitude inputs."""
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


class RAGOptimizer:
    """Expands queries and reranks candidate chunks via NVIDIA's hosted
    cross-encoder reranking API (Task 24, §20)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None
        self._log = logger.bind(component="rag_optimizer")

    # ------------------------------------------------------------------
    # HTTP client construction (lazy -- a missing/blank NVIDIA_API_KEY
    # must never crash module import or app boot, only an actual rerank
    # call, same pattern as NemotronEmbedder/GeminiGateway).
    # ------------------------------------------------------------------
    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            api_key = self._settings.nvidia_api_key.get_secret_value()
            if not api_key:
                raise RerankError(
                    "NVIDIA_API_KEY is not configured -- cannot call the NVIDIA "
                    "hosted Reranking API.",
                    details={"model": RERANKING_MODEL_NAME},
                )
            self._client = httpx.AsyncClient(
                base_url=self._settings.nvidia_reranking_base_url,
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
        # Never logs the request payload, response body, or the
        # Authorization header -- only counts/status/duration (§9, §26).
        self._log.warning(
            "rag_optimizer.rerank_failed",
            error_category="rate_limit" if status_code == 429 else "unknown",
            status_code=status_code,
            duration_ms=round((time.monotonic() - start) * 1000, 2),
        )

    # ------------------------------------------------------------------
    # Subtask 2: query expansion (§20) -- deterministic, no I/O.
    # ------------------------------------------------------------------
    def expand_query(self, query: str) -> list[str]:
        """Returns ``query`` plus up to two heuristic variants: an
        identifier-split form (code-search recall) and a filler-stripped
        form (keyword-search recall). Always includes ``query`` itself,
        first. Duplicate variants are dropped, order preserved.
        """
        variants = [query]

        split = _CAMEL_CASE_BOUNDARY.sub(" ", query).replace("_", " ").replace("-", " ")
        split = _WHITESPACE_RUN.sub(" ", split).strip()
        if split and split != query:
            variants.append(split)

        stripped = _strip_filler_prefix(query)
        if stripped and stripped != query:
            variants.append(stripped)

        deduped = list(dict.fromkeys(variants))
        self._log.info("rag_optimizer.query_expanded", variant_count=len(deduped))
        return deduped

    # ------------------------------------------------------------------
    # Subtasks 3-4: cross-encoder reranking (§20).
    # ------------------------------------------------------------------
    async def rerank_chunks(
        self,
        query: str,
        chunks: list[SearchResultItem],
        top_k: int = _DEFAULT_TOP_K,
        max_chunks_per_file: int = _DEFAULT_MAX_CHUNKS_PER_FILE,
    ) -> list[SearchResultItem]:
        """Re-scores ``chunks`` against ``query`` using NVIDIA's hosted
        cross-encoder, replaces each chunk's ``score`` with the
        resulting relevance probability, and returns up to ``top_k``,
        most relevant first. ``chunks`` themselves are never mutated --
        each returned item is a new copy.

        File-diversity selection (Task 60, live-evidenced): the raw
        score-sorted order is not returned as-is. Real testing against
        the Mazesolver repository found the cross-encoder repeatedly
        concentrating several of the top-5 slots on the same file
        (usually ``readme.md``) while crowding out a clearly relevant
        chunk from a *different* file that the question specifically
        needed -- e.g. "What does backend/maze.py do?" excluded
        ``backend/maze.py`` itself (ranked #9) in favor of a 4th
        ``readme.md``-family chunk, and a cross-file question excluded
        ``frontend/app.js`` and ``backend/app.py`` entirely in favor of
        four overlapping ``readme.md`` chunks. See
        ``_select_diverse``'s own docstring for the exact selection
        rule and why it never discards genuinely relevant content when
        few distinct files exist (verified against a real single-file
        "what is this repository about?" query, where all 4 relevant
        candidates come from ``readme.md`` and all 4 are still
        returned).
        """
        if not chunks:
            return []
        if top_k <= 0:
            raise ValueError("top_k must be positive")
        if max_chunks_per_file <= 0:
            raise ValueError("max_chunks_per_file must be positive")

        logits = await self._call_reranking_api(query, [chunk.content for chunk in chunks])
        rescored = [
            chunk.model_copy(update={"score": _sigmoid(logit)})
            for chunk, logit in zip(chunks, logits, strict=True)
        ]
        rescored.sort(key=lambda item: item.score, reverse=True)

        top = _select_diverse(rescored, top_k=top_k, max_per_file=max_chunks_per_file)
        self._log.info(
            "rag_optimizer.chunks_reranked",
            candidate_count=len(chunks),
            returned_count=len(top),
            distinct_files=len({item.metadata.file_path for item in top}),
        )
        return top

    async def _call_reranking_api(self, query: str, passages: list[str]) -> list[float]:
        client = self._get_client()
        payload = {
            "model": RERANKING_MODEL_NAME,
            "query": {"text": query},
            "passages": [{"text": passage} for passage in passages],
            "truncate": _TRUNCATE_MODE,
        }
        start = time.monotonic()

        async def _call() -> httpx.Response:
            response = await client.post(_RANKING_PATH, json=payload)
            response.raise_for_status()
            return response

        try:
            response = await self._run_with_retry(_call)
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            self._log_failure(exc, start, status_code=status_code)
            raise RerankError(
                f"NVIDIA reranking request failed with HTTP {status_code}",
                details={"status_code": status_code},
            ) from exc
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            self._log_failure(exc, start, status_code=None)
            raise RerankError("NVIDIA reranking request failed: network/timeout error") from exc
        except RerankError:
            raise
        except Exception as exc:
            self._log_failure(exc, start, status_code=None)
            raise RerankError(f"NVIDIA reranking request failed: {exc}") from exc

        return self._extract_logits(response, expected_count=len(passages))

    @staticmethod
    def _extract_logits(response: httpx.Response, *, expected_count: int) -> list[float]:
        try:
            body = response.json()
            rankings = body["rankings"]
        except (ValueError, KeyError, TypeError) as exc:
            raise RerankError("NVIDIA returned a malformed reranking response") from exc

        if not isinstance(rankings, list):
            raise RerankError(
                "NVIDIA reranking response's 'rankings' field is not a list",
            )

        # Placed by the response's own `index` field, never by list
        # position -- the same never-trust-response-order contract
        # embedder.py already applies to embeddings.
        logits_by_index: dict[int, float] = {}
        for entry in rankings:
            try:
                index = int(entry["index"])
                logit = float(entry["logit"])
            except (KeyError, TypeError, ValueError) as exc:
                raise RerankError("NVIDIA returned a malformed ranking entry") from exc

            if not 0 <= index < expected_count:
                raise RerankError(
                    "NVIDIA returned a ranking with an out-of-range index",
                    details={"index": index, "expected_count": expected_count},
                )
            logits_by_index[index] = logit

        if len(logits_by_index) != expected_count:
            raise RerankError(
                "NVIDIA returned fewer rankings than passages requested",
                details={"expected": expected_count, "actual": len(logits_by_index)},
            )
        return [logits_by_index[i] for i in range(expected_count)]

    async def close(self) -> None:
        """Releases the underlying HTTP client, if one was ever
        constructed -- same explicit-lifecycle pattern as
        :meth:`NemotronEmbedder.close`."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._log.debug("rag_optimizer.client_closed")


def _select_diverse(
    ranked: list[SearchResultItem], *, top_k: int, max_per_file: int
) -> list[SearchResultItem]:
    """Selects up to ``top_k`` items from ``ranked`` (already sorted,
    most relevant first), preferring distinct ``file_path`` values over
    the raw score order, most relevant first (Task 60, ``rerank_chunks``'s
    own docstring has the real evidence this addresses).

    Two-pass greedy selection, not a hard per-file quota:

    1. Walk ``ranked`` in order, taking an item unless its file has
       already reached ``max_per_file`` in this selection -- so a
       lower-scored chunk from a *new* file is preferred over another
       chunk from a file already represented, exactly the "don't let
       the reranker crowd every slot with one file" fix this was added
       for.
    2. If fewer than ``top_k`` distinct-enough items exist (too few
       distinct files to fill every slot under the cap), backfill the
       remaining slots from whatever was skipped in pass 1, in their
       original score order. This is what keeps a genuinely
       single-file-relevant question (e.g. "what is this repository
       about?", where every real candidate is a ``readme.md`` chunk)
       returning every one of them, never artificially truncated to
       one just because they share a file.

    The returned list is re-sorted by score, descending, before return
    -- diversity changes *which* items are selected, never the
    relevance order the LLM and ``ContextBuilder``'s budget-truncation
    logic sees them in.
    """
    selected: list[SearchResultItem] = []
    skipped: list[SearchResultItem] = []
    counts: dict[str, int] = {}

    for item in ranked:
        if len(selected) >= top_k:
            break
        path = item.metadata.file_path
        if counts.get(path, 0) < max_per_file:
            selected.append(item)
            counts[path] = counts.get(path, 0) + 1
        else:
            skipped.append(item)

    for item in skipped:
        if len(selected) >= top_k:
            break
        selected.append(item)

    selected.sort(key=lambda item: item.score, reverse=True)
    return selected


def _strip_filler_prefix(query: str) -> str:
    lowered = query.lower()
    for prefix in _FILLER_PREFIXES:
        if lowered.startswith(prefix):
            return query[len(prefix) :].strip().rstrip("?").strip()
    return query
