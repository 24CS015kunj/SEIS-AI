"""LLM Generation Gateway.

Sole adapter for answer-generation LLM calls (§5.9): text generation and
token counting pass through this module -- the rest of the application
never talks to a generation provider's HTTP API directly.

**Generation-provider migration (Task 60, ADR-008)**: Gemini
(``gemini-3.6-flash``) is retired as the answer-generation LLM. Live
testing during Task 59 showed real ``generate_text`` calls against
Gemini intermittently timing out around 30s under normal repository-chat
load, with no reliable fix short of changing provider. The FINAL
generation provider is now NVIDIA's **hosted** inference API serving
**Nemotron 3 Ultra** (``nvidia/nemotron-3-ultra-550b-a55b``) -- the same
no-local-model/no-GPU pattern ADR-007 (embeddings) and Task 24
(reranking) already established, and the same ``NVIDIA_API_KEY`` those
two already use. No new secret, no new SDK: ``httpx`` (already a
dependency for the embedding/reranking adapters) is reused rather than
adding the ``openai`` package for what is, underneath, one more
OpenAI-compatible HTTPS POST.

Verified live against NVIDIA's real hosted API before this module was
considered done (not copied from a possibly-stale doc example), the same
verification discipline ``rag_optimizer.py``'s own docstring documents
for its endpoint:

- ``POST https://integrate.api.nvidia.com/v1/chat/completions`` -- the
  *same host* ``NemotronEmbedder`` already uses for embeddings (unlike
  reranking's separate ``ai.api.nvidia.com`` host), confirmed via a real
  200 response with ``Authorization: Bearer <NVIDIA_API_KEY>``.
- Request: OpenAI-compatible ``{"model": ..., "messages": [...],
  "max_tokens": ..., "temperature": ...}``. ``system_instruction`` maps
  to a ``{"role": "system", ...}`` message, omitted entirely when
  ``None`` -- confirmed live that a system + user message pair is
  accepted and honored.
- Response: OpenAI-compatible ``{"choices": [{"message": {"content":
  ..., "reasoning_content": ...}, "finish_reason": ...}], "usage":
  {"prompt_tokens": ..., "completion_tokens": ..., "total_tokens":
  ...}}``. Only ``choices[0].message.content`` is ever returned to
  callers -- ``reasoning_content`` (see below) is internal
  chain-of-thought, never the grounded answer this system cites.

Reasoning toggle (latency finding, Task 60): Nemotron 3 Ultra is a
hybrid reasoning model that, by default, emits a ``reasoning_content``
chain-of-thought before its actual answer. Live-measured against a
realistic ~4200-token grounded repository-chat prompt: **6.0s** with
reasoning on (581 completion tokens) versus **3.0s** with reasoning off
via ``{"chat_template_kwargs": {"enable_thinking": false}}`` (278
completion tokens) -- half the latency and half the billed completion
tokens, both real requests producing an equally grounded, correctly
cited answer. Grounded repository-chat extraction/citation does not
need exposed multi-step reasoning, so this module always sends
``enable_thinking: false`` -- the same "no exposed knob for a
deliberate, evidence-based default" treatment ``temperature`` already
gets from ``RepositoryChatService``'s own ``_CHAT_TEMPERATURE`` constant.

Token counting: NVIDIA's hosted chat completions API has no dedicated
token-counting endpoint (unlike Gemini's ``count_tokens``), so
``count_tokens`` here is a local, dependency-free ``len(text) // 4``
estimate -- no network call, no new library (adding ``tiktoken`` for a
model it was never trained to tokenize would be a false-precision
dependency, not a real one). This is a real latency fix, not just a
provider-parity shim: ``ContextBuilder.build_context`` calls
``count_tokens`` once per candidate chunk (up to 6 times per chat turn
against the label + up to 5 reranked chunks), and with Gemini's
``count_tokens`` each of those was a sequential network round-trip
*before generation itself even started* -- a real, measured contributor
to the chat pipeline's total latency, now eliminated entirely.
Correctness impact is negligible: ``ContextBuilder``'s 4000-token
default budget is a soft packing cutoff, not a hard billing constraint,
and sits nowhere near Nemotron 3 Ultra's 1M-token context window.

Filename/class-name note (frozen file tree vs. this migration -- the
same reconciliation Task 12's own docstring already recorded once for
this exact file): this module's filename stays ``gemini_client.py``
per the project's "never rename existing files" rule, even though the
class inside is renamed ``GeminiGateway`` -> ``NemotronGateway`` and no
longer calls Gemini at all. Exact precedent: Task 15/ADR-007 did the
same thing to ``app/core/embedding/embedder.py`` -- renamed the class
``GeminiEmbedder`` -> ``NemotronEmbedder`` in place, updated every
caller's imported type name (``VectorRetriever``, deps.py, tests) while
changing none of their own logic, and never renamed or duplicated the
file itself. Every caller of this gateway (``ContextBuilder``,
``RepositoryChatService``, ``app.api.deps``) is updated the same way.

Async/sync boundary: every method here is a direct ``await`` on
``httpx.AsyncClient`` -- no ``asyncio.to_thread`` dispatch, same
reasoning as ``NemotronEmbedder``/``RAGOptimizer``.

Timeout: enforced via ``httpx.AsyncClient(timeout=...)`` from
``Settings.nemotron_timeout_ms`` -- the same client-level timeout
pattern ``NemotronEmbedder``/``RAGOptimizer`` already use, rather than
Gemini's old manual ``asyncio.wait_for`` (needed there only because the
pinned ``google-genai`` SDK's ``HttpOptions`` had no native timeout
field; ``httpx`` always has one).

Retry: two separate, narrow, bounded policies -- neither unlimited.
A real HTTP 429 (rate limit) is retried with bounded exponential backoff
(``stop_after_attempt(4)``), the same scope ``NemotronEmbedder``/
``RAGOptimizer`` already use -- unchanged since Task 60. A real request
timeout (``httpx.TimeoutException``) **or** a transient HTTP 5xx
response (``500``-``599``, added Task 61) shares one combined,
much narrower budget: exactly ONE extra attempt total
(``_MAX_TRANSIENT_RETRIES = 1``), with no backoff wait -- whichever of
the two happens first consumes that one extra attempt, so a call can
never exceed two real attempts even if it hits a timeout on attempt 1
and a 5xx on attempt 2 (or vice versa). The timeout half was added in
Task 60 after live E2E testing hit a genuine full-timeout stall against
NVIDIA's free hosted tier that succeeded immediately on retry (see
``_run_with_retry``'s own docstring for the full finding and the
Express-proxy-budget reasoning behind not retrying more than once). The
5xx half was added in Task 61 after live E2E testing hit a real,
fast-failing ``503 Service Unavailable`` (not a timeout -- 0.42s
server-side) that also succeeded immediately on an identical retry --
the same transient-free-tier-stall profile, just surfaced as an
explicit error status instead of a hang. Every other failure (401, 403,
404, other 4xx, malformed responses, connection errors) is translated
once into :class:`LLMError` without retrying, since retrying a bad
request, a missing/invalid credential, or a broken connection cannot
fix it (§25: "do not blindly retry every HTTP error").

Lazy construction: the ``httpx.AsyncClient`` is built on first real use,
not in ``__init__``, so a missing/blank ``NVIDIA_API_KEY`` never crashes
process boot -- it surfaces as an :class:`LLMError` only when generation
is actually attempted, the same pattern every other NVIDIA-backed
adapter in this codebase already follows.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx
import structlog
from tenacity import AsyncRetrying, retry_if_exception, stop_after_attempt, wait_exponential

from app.config.settings import Settings
from app.domain.exceptions import LLMError, LLMRateLimitError

logger = structlog.get_logger("seis.infra.llm")

T = TypeVar("T")

_CHAT_COMPLETIONS_PATH = "/chat/completions"

# Live-measured (module docstring): halves both latency and billed
# completion tokens for grounded repository-chat prompts, with no loss
# of answer quality or citation correctness in real testing. Not exposed
# as a caller-supplied knob -- same treatment as `_CHAT_TEMPERATURE` in
# RepositoryChatService.
_DISABLE_REASONING = {"chat_template_kwargs": {"enable_thinking": False}}

# NVIDIA's hosted chat completions API has no token-counting endpoint
# (module docstring) -- a plain chars-per-token estimate, the same
# ballpark ratio commonly used for English text/code, with no network
# call and no new tokenizer dependency.
_CHARS_PER_TOKEN_ESTIMATE = 4

# Exactly one bounded extra attempt, shared between a genuine request
# timeout and a transient HTTP 5xx response (module docstring's "Retry"
# section) -- never unlimited, and deliberately much narrower than the
# 429 policy below. Task 60 introduced this for timeouts as
# `_MAX_TIMEOUT_RETRIES`; Task 61 renamed it and widened what triggers
# it to also cover transient 5xx, without changing the bound itself.
_MAX_TRANSIENT_RETRIES = 1

# Standard "the server-side problem, not the request" range -- matches
# the real failure Task 61 found live (503) plus its closest siblings
# (500, 502, 504), all of which are, by HTTP semantics, about the
# server/upstream rather than anything a client retry could never fix
# (unlike 4xx, which always means "this request is the problem").
_TRANSIENT_SERVER_ERROR_RANGE = range(500, 600)


def _is_rate_limit_error(exc: BaseException) -> bool:
    """True only for a real NVIDIA HTTP 429 -- the one failure mode the
    inner 429 retry policy handles, the same narrow retry scope every
    other NVIDIA-backed adapter in this codebase already established."""
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429


def _is_transient_server_error(exc: BaseException) -> bool:
    """True only for a real NVIDIA HTTP 5xx -- distinct from
    ``_is_rate_limit_error`` (429 is a 4xx) so the two never overlap and
    each keeps its own retry policy (module docstring's "Retry"
    section)."""
    return (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code in _TRANSIENT_SERVER_ERROR_RANGE
    )


class NemotronGateway:
    """Application-facing adapter over NVIDIA's hosted Nemotron 3 Ultra
    chat completions API (Task 60, ADR-008).

    Renamed from ``GeminiGateway`` -- see the module docstring's
    "Filename/class-name note" -- the same class-renamed/file-kept
    reconciliation Task 15/ADR-007 already established for
    ``GeminiEmbedder`` -> ``NemotronEmbedder``.

    One instance is constructed per process (see
    ``app.api.deps.get_nemotron_gateway``) and reused for the process
    lifetime -- a new ``httpx.AsyncClient`` is never created per call.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None
        self._log = logger.bind(component="nemotron_gateway")

    # ------------------------------------------------------------------
    # HTTP client construction (lazy -- a missing/blank NVIDIA_API_KEY
    # must never crash module import or app boot, only an actual
    # generation call, same pattern as NemotronEmbedder/RAGOptimizer).
    # ------------------------------------------------------------------
    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            api_key = self._settings.nvidia_api_key.get_secret_value()
            if not api_key:
                raise LLMError(
                    "NVIDIA_API_KEY is not configured -- cannot call the NVIDIA "
                    "hosted Generation API.",
                    details={"model": self._settings.nemotron_model_name},
                )
            self._client = httpx.AsyncClient(
                base_url=self._settings.nvidia_generation_base_url,
                timeout=self._settings.nemotron_timeout_ms / 1000,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    # ------------------------------------------------------------------
    # Execution helper: bounded 429 retry + a SEPARATE, much narrower
    # bounded timeout-or-5xx retry + error translation + structured
    # logging (§14, §15). Never logs the prompt/response content itself
    # or the Authorization header -- only lengths, status, and duration.
    #
    # Timeout retry (Task 60 live finding): real E2E testing against the
    # live NVIDIA API hit a genuine `ReadTimeout` -- zero response bytes
    # for the full configured timeout -- on an otherwise-ordinary,
    # small (~416-token) grounded-chat prompt. Retrying the identical
    # request moments later succeeded in 9.85s. This is the profile of a
    # transient stall on NVIDIA's free hosted tier (a request landing on
    # an overloaded backend replica), not a malformed or oversized
    # request.
    #
    # Transient 5xx retry (Task 61 live finding): the same free-tier
    # instability also surfaces as a fast, explicit ``503 Service
    # Unavailable`` rather than a hang -- real E2E testing hit one
    # (0.42s server-side, nowhere near the timeout budget) that also
    # succeeded immediately on an identical retry.
    #
    # Both share ONE bounded extra-attempt budget
    # (`_MAX_TRANSIENT_RETRIES = 1`, not tenacity's 429 policy) with NO
    # added backoff wait: doubling an already-multi-second timeout
    # budget with exponential waits on top would risk exceeding the
    # Express chat proxy's own 75s budget
    # (`backend/src/config/fastapi.config.js`) for no benefit, since the
    # observed failure modes resolve (or don't) immediately on the next
    # attempt, not after a delay. Sharing one counter across both
    # trigger types -- rather than giving each its own -- is what
    # guarantees a call can never exceed two real attempts even if it
    # hits a timeout on attempt 1 and a 5xx on attempt 2 (or vice
    # versa). `Settings.nemotron_timeout_ms` was lowered from 45s to 30s
    # in Task 60 specifically so that worst case (2 attempts) stays at
    # 60s, comfortably inside that 75s budget -- unchanged by this
    # addition.
    # ------------------------------------------------------------------
    async def _run_with_retry(self, fn: Callable[[], Awaitable[T]]) -> T:
        for retry_attempt in range(_MAX_TRANSIENT_RETRIES + 1):
            has_budget = retry_attempt < _MAX_TRANSIENT_RETRIES
            try:
                async for attempt in AsyncRetrying(
                    retry=retry_if_exception(_is_rate_limit_error),
                    stop=stop_after_attempt(4),
                    wait=wait_exponential(multiplier=1, max=20),
                    reraise=True,
                ):
                    with attempt:
                        return await fn()
            except httpx.TimeoutException:
                if has_budget:
                    self._log.warning(
                        "llm.timeout_retrying",
                        attempt=retry_attempt + 1,
                        max_attempts=_MAX_TRANSIENT_RETRIES + 1,
                    )
                    continue
                raise
            except httpx.HTTPStatusError as exc:
                if has_budget and _is_transient_server_error(exc):
                    self._log.warning(
                        "llm.transient_5xx_retrying",
                        status_code=exc.response.status_code,
                        attempt=retry_attempt + 1,
                        max_attempts=_MAX_TRANSIENT_RETRIES + 1,
                    )
                    continue
                raise
        raise AssertionError("unreachable: exhausted the bounded transient-retry loop")

    def _log_failure(self, exc: BaseException, start: float, *, status_code: int | None) -> None:
        if status_code == 429:
            category = "rate_limit"
        elif status_code in _TRANSIENT_SERVER_ERROR_RANGE:
            category = "server_error"
        elif isinstance(exc, httpx.TimeoutException):
            category = "timeout"
        else:
            category = "unknown"
        self._log.error(
            "llm.operation_failed",
            error_category=category,
            status_code=status_code,
            duration_ms=round((time.monotonic() - start) * 1000, 2),
            error=str(exc),
        )

    async def _execute(self, operation: str, fn: Callable[[], Awaitable[T]]) -> T:
        log = self._log.bind(operation=operation, model=self._settings.nemotron_model_name)
        start = time.monotonic()
        try:
            result = await self._run_with_retry(fn)
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            self._log_failure(exc, start, status_code=status_code)
            if status_code == 429:
                raise LLMRateLimitError(
                    f"Nemotron {operation} rate-limited", details={"operation": operation}
                ) from exc
            raise LLMError(
                f"Nemotron {operation} failed",
                details={"operation": operation, "status_code": status_code},
            ) from exc
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            self._log_failure(exc, start, status_code=None)
            raise LLMError(
                f"Nemotron {operation} failed: network/timeout error",
                details={"operation": operation},
            ) from exc
        except LLMError:
            raise
        except Exception as exc:
            self._log_failure(exc, start, status_code=None)
            raise LLMError(
                f"Nemotron {operation} failed", details={"operation": operation}
            ) from exc
        else:
            log.debug(
                "llm.operation_succeeded",
                duration_ms=round((time.monotonic() - start) * 1000, 2),
            )
            return result

    # ------------------------------------------------------------------
    # Public adapter surface -- same frozen signatures ContextBuilder/
    # RepositoryChatService already depend on.
    # ------------------------------------------------------------------
    async def generate_text(
        self, prompt: str, system_instruction: str | None, temperature: float
    ) -> str:
        """Executes one chat-completion call and returns the answer text.

        ``max_output_tokens`` is not a parameter here (it is not part of
        the frozen signature) -- it is applied internally from
        ``Settings.nemotron_max_output_tokens``, the same way the model
        name is, rather than exposing another caller-supplied knob.
        Reasoning is always disabled (module docstring) -- only the final
        answer (``message.content``) is returned, never
        ``message.reasoning_content``.
        """
        client = self._get_client()
        messages: list[dict[str, str]] = []
        if system_instruction is not None:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self._settings.nemotron_model_name,
            "messages": messages,
            "max_tokens": self._settings.nemotron_max_output_tokens,
            "temperature": temperature,
            **_DISABLE_REASONING,
        }

        async def _call() -> httpx.Response:
            response = await client.post(_CHAT_COMPLETIONS_PATH, json=payload)
            response.raise_for_status()
            return response

        response = await self._execute("generate_text", _call)
        return self._extract_text(response)

    def _extract_text(self, response: httpx.Response) -> str:
        try:
            body = response.json()
            choices = body["choices"]
            content = choices[0]["message"]["content"]
        except (ValueError, KeyError, TypeError, IndexError) as exc:
            raise LLMError("Nemotron returned a malformed generation response") from exc

        if not isinstance(content, str) or not content:
            raise LLMError(
                "Nemotron returned no text content",
                details={"model": self._settings.nemotron_model_name},
            )
        return content

    async def count_tokens(self, text: str) -> int:
        """Returns an approximate token count for ``text`` (module
        docstring: no live tokenizer call, no new dependency). Never
        raises -- this is a local, deterministic estimate."""
        return max(1, len(text) // _CHARS_PER_TOKEN_ESTIMATE)

    async def close(self) -> None:
        """Releases the underlying HTTP client, if one was ever
        constructed -- same explicit-lifecycle pattern as
        :meth:`NemotronEmbedder.close`/:meth:`RAGOptimizer.close`."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._log.debug("nemotron_gateway.client_closed")
