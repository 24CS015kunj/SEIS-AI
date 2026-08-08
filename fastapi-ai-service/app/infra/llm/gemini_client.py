"""Gemini Client.

Low-level Gemini SDK/API client wrapped by the Gemini Gateway
(§5.9, §core/generation/gemini_gateway.py). Owns connection setup,
authentication, and raw request/response handling only — no prompt or
business logic.

Sole adapter to Gemini (Task 12, ADR-003): text generation and token
counting pass through this module — the rest of the application never
imports ``google.genai`` directly.

Filename/class-name note (frozen file tree vs. Phase 2 spec text — the
same reconciliation as Tasks 10-11): the Phase 2 specification names
this file ``app/infra/llm/gemini_gateway.py``; Task 1's actual frozen
folder structure created ``app/infra/llm/gemini_client.py`` instead.
Implemented here, in the existing file, per ``09_PROJECT_RULES.md``'s
"never rename existing files" rule. The class is still named
``GeminiGateway`` exactly as the specification's subtask 1 names it.

A SEPARATE, still-empty stub also exists at
``app/core/generation/gemini_gateway.py`` (Core layer). This module's
own opening paragraph (frozen since Task 1) already says the low-level
client is "wrapped BY the Gemini Gateway" — implying prompt assembly
and RAG business logic eventually live in that Core-layer file,
calling into *this* class for the raw API call. That file is left
untouched: prompt/business logic is explicitly out of Task 12's scope
("no prompt or business logic", per this module's own docstring), and
belongs to whichever future task builds it (Phase 4 Prompt
Builder/RAG, or the Repository Chat Service that coordinates
"Prompt Builder -> Gemini Gateway" per its own docstring).

Async/sync boundary: ``google.genai``'s ``Client.aio`` namespace
(``client.aio.models.generate_content`` / ``.count_tokens``) is a
genuine async interface (confirmed via
``inspect.iscoroutinefunction``) — every method here is a direct
``await``, no ``asyncio.to_thread`` dispatch, the same reasoning as
Task 10's Redis client, not Task 9's synchronous ChromaDB one.

Timeout: the pinned ``google-genai==0.3.0`` release's ``HttpOptions``
has no ``timeout`` field to configure on the client itself, so
``Settings.gemini_timeout_ms`` is enforced manually via
``asyncio.wait_for`` around each attempt instead — still satisfying
"always set sensible timeout limits on LLM API calls" without
depending on an SDK capability this pinned version doesn't expose.

Retry: narrower than Tasks 9-11's connection-class retry — the
specification asks only for "exponential backoff retry handler for
rate-limit HTTP 429 errors". Every other failure (4xx client errors,
5xx server errors, timeouts) is translated once into :class:`LLMError`
without retrying, since retrying a malformed request or a
already-timed-out call cannot fix it.

Lazy construction: ``genai.Client`` is built on first real use, not in
``__init__``, so a missing/blank API key never crashes process boot —
it surfaces as an ``LLMError`` only when generation is actually
attempted. Task 12's specification has no readiness subtask (like Task
11, unlike Tasks 9-10), so no ``/health/ready`` check is registered
here.
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
from app.domain.exceptions import LLMError, LLMRateLimitError

logger = structlog.get_logger("seis.infra.llm")

T = TypeVar("T")


def _is_rate_limit_error(exc: BaseException) -> bool:
    """True only for a Gemini HTTP 429 -- the one failure mode the
    specification asks to retry with exponential backoff."""
    return isinstance(exc, genai_errors.ClientError) and getattr(exc, "code", None) == 429


class GeminiGateway:
    """Application-facing adapter over the Gemini SDK (Task 12, ADR-003).

    One instance is constructed per process (see
    ``app.api.deps.get_gemini_gateway``) and reused for the process
    lifetime — a new ``genai.Client`` is never created per call.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: genai.Client | None = None
        self._log = logger.bind(component="gemini_gateway")

    # ------------------------------------------------------------------
    # SDK client construction (lazy)
    # ------------------------------------------------------------------
    def _get_client(self) -> genai.Client:
        if self._client is None:
            api_key = self._settings.gemini_api_key.get_secret_value()
            if not api_key:
                raise LLMError(
                    "GEMINI_API_KEY is not configured -- cannot call the Gemini API.",
                    details={"model": self._settings.gemini_model_name},
                )
            self._client = genai.Client(api_key=api_key)
        return self._client

    # ------------------------------------------------------------------
    # Execution helper: per-attempt timeout + bounded 429 retry + error
    # translation + structured logging (§14, §15). Never logs the
    # prompt/response content itself -- only lengths and metadata.
    # ------------------------------------------------------------------
    async def _run_with_retry(self, fn: Callable[[], Awaitable[T]]) -> T:
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

    async def _execute(self, operation: str, fn: Callable[[], Awaitable[T]]) -> T:
        log = self._log.bind(operation=operation, model=self._settings.gemini_model_name)
        start = time.perf_counter()
        try:
            result = await self._run_with_retry(fn)
        except LLMError:
            raise
        except genai_errors.ClientError as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            status_code = getattr(exc, "code", None)
            if status_code == 429:
                log.error(
                    "llm.operation_failed",
                    error_category="rate_limit",
                    duration_ms=duration_ms,
                    error=str(exc),
                )
                raise LLMRateLimitError(
                    f"Gemini {operation} rate-limited", details={"operation": operation}
                ) from exc
            log.error(
                "llm.operation_failed",
                error_category="client_error",
                duration_ms=duration_ms,
                status_code=status_code,
                error=str(exc),
            )
            raise LLMError(
                f"Gemini {operation} failed",
                details={"operation": operation, "status_code": status_code},
            ) from exc
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "llm.operation_failed",
                error_category="unknown",
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise LLMError(f"Gemini {operation} failed", details={"operation": operation}) from exc
        else:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.debug("llm.operation_succeeded", duration_ms=duration_ms)
            return result

    # ------------------------------------------------------------------
    # Public adapter surface (Task 12 subtasks 2 and 4)
    # ------------------------------------------------------------------
    async def generate_text(
        self, prompt: str, system_instruction: str | None, temperature: float
    ) -> str:
        """Executes one text-generation call and returns the response text.

        ``max_output_tokens`` is not a parameter here (it is not part of
        the frozen signature) -- it is applied internally from
        ``Settings.gemini_max_output_tokens``, the same way the model
        name is, rather than exposing another caller-supplied knob.
        """
        client = self._get_client()
        config = genai_types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            max_output_tokens=self._settings.gemini_max_output_tokens,
        )

        async def _call() -> genai_types.GenerateContentResponse:
            return await client.aio.models.generate_content(
                model=self._settings.gemini_model_name,
                contents=prompt,
                config=config,
            )

        response = await self._execute("generate_text", _call)
        text = response.text
        if text is None:
            raise LLMError(
                "Gemini returned no text content",
                details={"model": self._settings.gemini_model_name},
            )
        return str(text)

    async def count_tokens(self, text: str) -> int:
        """Returns the token count Gemini would bill for ``text``."""
        client = self._get_client()

        async def _call() -> genai_types.CountTokensResponse:
            return await client.aio.models.count_tokens(
                model=self._settings.gemini_model_name, contents=text
            )

        response = await self._execute("count_tokens", _call)
        return int(response.total_tokens or 0)
