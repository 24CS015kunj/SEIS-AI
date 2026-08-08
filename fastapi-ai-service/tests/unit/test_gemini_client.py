"""Unit tests for app/infra/llm/gemini_client.py (Task 12).

These tests exercise the adapter's own logic (lazy construction,
config usage, 429-only retry, timeout enforcement, error translation)
against a minimal fake standing in for the `google.genai` SDK's async
client. Rate-limit/error scenarios use *real* `google.genai.errors`
exception instances (constructed via a real `requests.Response`), not
hand-rolled substitutes, so the `isinstance`/`.code` checks in
`_is_rate_limit_error` are exercised genuinely. Live-API verification
(an actual Gemini call) is covered separately by
tests/integration/test_gemini_client_integration.py, gated on a real
API key.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
import requests
from google import genai  # type: ignore[import-untyped]
from google.genai import errors as genai_errors  # type: ignore[import-untyped]

from app.config.settings import Settings
from app.domain.exceptions import LLMError, LLMRateLimitError
from app.infra.llm.gemini_client import GeminiGateway


def _make_api_error(code: int, message: str) -> genai_errors.ClientError:
    response = requests.Response()
    response.status_code = code
    response._content = f'{{"error": {{"message": "{message}"}}}}'.encode()
    return genai_errors.ClientError(code, response)


class FakeResponse:
    def __init__(self, text: str | None) -> None:
        self.text = text


class FakeCountTokensResponse:
    def __init__(self, total_tokens: int) -> None:
        self.total_tokens = total_tokens


class FakeModels:
    def __init__(self) -> None:
        self.generate_content_calls: list[dict[str, Any]] = []
        self.count_tokens_calls: list[dict[str, Any]] = []
        self.next_response_text: str | None = "generated response"
        self.next_total_tokens = 42
        self.generate_content_errors: list[Exception] = []
        self.count_tokens_errors: list[Exception] = []
        self.generate_content_delay = 0.0

    async def generate_content(self, *, model: str, contents: Any, config: Any) -> FakeResponse:
        self.generate_content_calls.append({"model": model, "contents": contents, "config": config})
        if self.generate_content_delay:
            await asyncio.sleep(self.generate_content_delay)
        if self.generate_content_errors:
            raise self.generate_content_errors.pop(0)
        return FakeResponse(self.next_response_text)

    async def count_tokens(self, *, model: str, contents: Any) -> FakeCountTokensResponse:
        self.count_tokens_calls.append({"model": model, "contents": contents})
        if self.count_tokens_errors:
            raise self.count_tokens_errors.pop(0)
        return FakeCountTokensResponse(self.next_total_tokens)


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
async def test_missing_api_key_raises_llmerror_without_constructing_client(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings(gemini_api_key=""))
    with pytest.raises(LLMError, match="GEMINI_API_KEY is not configured"):
        await gateway.generate_text("hello", None, 0.2)
    assert "client" not in fake_genai


async def test_client_is_constructed_lazily_and_reused_across_calls(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    assert gateway._client is None

    await gateway.generate_text("hello", None, 0.2)
    first_client = gateway._client
    assert first_client is not None

    await gateway.generate_text("hello again", None, 0.2)
    assert gateway._client is first_client
    assert len(fake_genai) == 1  # genai.Client() constructed exactly once


# ---------------------------------------------------------------------------
# generate_text
# ---------------------------------------------------------------------------
async def test_generate_text_returns_the_response_text(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    result = await gateway.generate_text("What does this function do?", "Be concise.", 0.3)
    client = fake_genai["client"]

    assert result == "generated response"
    call = client.models.generate_content_calls[0]
    assert call["model"] == "gemini-2.5-flash"
    assert call["contents"] == "What does this function do?"
    assert call["config"].system_instruction == "Be concise."
    assert call["config"].temperature == 0.3


async def test_generate_text_applies_max_output_tokens_from_settings(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings(gemini_max_output_tokens=777))
    await gateway.generate_text("prompt", None, 0.5)

    call = fake_genai["client"].models.generate_content_calls[0]
    assert call["config"].max_output_tokens == 777


async def test_generate_text_raises_llmerror_when_response_has_no_text(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)
    fake_genai["client"].models.next_response_text = None

    with pytest.raises(LLMError, match="Gemini returned no text content"):
        await gateway.generate_text("prompt", None, 0.2)


# ---------------------------------------------------------------------------
# count_tokens
# ---------------------------------------------------------------------------
async def test_count_tokens_returns_total_tokens(fake_genai: dict[str, FakeGenaiClient]) -> None:
    gateway = GeminiGateway(settings=_settings())
    result = await gateway.count_tokens("some text to count")
    client = fake_genai["client"]

    assert result == 42
    assert client.models.count_tokens_calls[0]["contents"] == "some text to count"


# ---------------------------------------------------------------------------
# 429 rate-limit retry (the specification's one explicitly-required retry case)
# ---------------------------------------------------------------------------
async def test_rate_limit_429_retries_then_succeeds(fake_genai: dict[str, FakeGenaiClient]) -> None:
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)  # force client construction
    models = fake_genai["client"].models
    models.generate_content_errors = [
        _make_api_error(429, "rate limited"),
        _make_api_error(429, "rate limited"),
    ]

    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "generated response"
    assert len(models.generate_content_calls) == 4  # warm-up + 2 failed + 1 succeeded


async def test_rate_limit_429_exhausts_retries_and_raises_llmratelimiterror(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)
    models = fake_genai["client"].models
    models.generate_content_errors = [_make_api_error(429, "rate limited") for _ in range(10)]

    with pytest.raises(LLMRateLimitError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert exc_info.value.category.value == "rate_limit"
    assert exc_info.value.http_status == 429
    assert exc_info.value.retryable is True
    assert isinstance(exc_info.value.__cause__, genai_errors.ClientError)


# ---------------------------------------------------------------------------
# Non-429 errors: translated once, never retried
# ---------------------------------------------------------------------------
async def test_non_rate_limit_client_error_translated_without_retry(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)
    models = fake_genai["client"].models
    models.generate_content_errors = [_make_api_error(400, "bad request")]

    with pytest.raises(LLMError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert not isinstance(exc_info.value, LLMRateLimitError)
    assert exc_info.value.details["status_code"] == 400
    # warm-up (1) + exactly one failed attempt -- no retry for a 400
    assert len(models.generate_content_calls) == 2


async def test_llmerror_raised_inside_an_operation_passes_through_unwrapped(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    """If an `LLMError` is already the exception in flight (e.g. the missing-
    API-key check inside `_get_client`), `_execute` must not double-wrap it
    into a second, less-informative `LLMError`."""
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)

    async def _already_translated() -> None:
        raise LLMError("nested failure", details={"operation": "inner"})

    with pytest.raises(LLMError, match="nested failure"):
        await gateway._execute("outer_op", _already_translated)


async def test_generic_exception_translated_to_llmerror(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings())
    await gateway.generate_text("warm-up", None, 0.2)
    models = fake_genai["client"].models
    models.generate_content_errors = [RuntimeError("unexpected SDK failure")]

    with pytest.raises(LLMError, match="generate_text failed"):
        await gateway.generate_text("prompt", None, 0.2)


# ---------------------------------------------------------------------------
# Timeout enforcement (Settings.gemini_timeout_ms, since the pinned SDK
# version's HttpOptions has no native timeout field)
# ---------------------------------------------------------------------------
async def test_slow_call_is_translated_to_llmerror_via_timeout(
    fake_genai: dict[str, FakeGenaiClient],
) -> None:
    gateway = GeminiGateway(settings=_settings(gemini_timeout_ms=20))
    await gateway.generate_text("warm-up", None, 0.2)
    fake_genai["client"].models.generate_content_delay = 0.5  # far longer than the 20ms budget

    with pytest.raises(LLMError, match="generate_text failed"):
        await gateway.generate_text("prompt", None, 0.2)
