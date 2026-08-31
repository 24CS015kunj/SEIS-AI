"""Unit tests for app/infra/llm/gemini_client.py (Task 12; NVIDIA
Nemotron 3 Ultra migration, Task 60/ADR-008).

Uses a real `NemotronGateway` instance whose underlying
`httpx.AsyncClient` is built with `httpx.MockTransport` -- same "construct
real instances, substitute the minimum necessary for determinism"
philosophy as `tests/unit/test_embedder.py`, exercising the module's real
request-construction, header, retry, and response-parsing logic against a
fully deterministic fake HTTP server rather than monkeypatching around
it. Live-API verification (an actual Nemotron 3 Ultra call) is covered
separately by tests/integration/test_gemini_client_integration.py, gated
on a real NVIDIA_API_KEY.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.config.settings import Settings
from app.domain.exceptions import LLMError, LLMRateLimitError
from app.infra.llm.gemini_client import NemotronGateway


def _settings(**overrides: Any) -> Settings:
    # nemotron_model_name is pinned explicitly, same as nvidia_api_key --
    # otherwise Settings() falls through to the ambient .env file's real
    # value, making this suite's expectations depend on local
    # configuration instead of being fully isolated (Task 55).
    defaults: dict[str, Any] = {
        "nvidia_api_key": "fake-test-key",
        "nemotron_model_name": "nvidia/nemotron-3-ultra-550b-a55b",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def _chat_response(
    content: str | None,
    *,
    status_code: int = 200,
    reasoning_content: str | None = "some internal reasoning",
) -> httpx.Response:
    # `content` is always present as a key (even when `None`, serialized
    # as JSON `null`) so a "no answer text" scenario exercises the
    # empty/None-content check in `_extract_text`, not the missing-key
    # `KeyError` branch (a genuinely malformed response, tested
    # separately below).
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if reasoning_content is not None:
        message["reasoning_content"] = reasoning_content
    body = {
        "id": "chatcmpl-fake",
        "object": "chat.completion",
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    return httpx.Response(
        status_code,
        content=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
    )


def _gateway_with_transport(
    handler: Callable[[httpx.Request], httpx.Response], settings: Settings | None = None
) -> NemotronGateway:
    """Builds a real `NemotronGateway` whose lazily-constructed HTTP
    client is pre-seeded with a `MockTransport` -- mirrors
    `test_embedder.py`'s `_embedder_with_transport` helper exactly."""
    gateway = NemotronGateway(settings=settings or _settings())
    gateway._client = httpx.AsyncClient(
        base_url=gateway._settings.nvidia_generation_base_url,
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer fake-test-key", "Content-Type": "application/json"},
    )
    return gateway


def _request_body(request: httpx.Request) -> dict[str, Any]:
    return json.loads(request.content)  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Lazy construction / missing API key
# ---------------------------------------------------------------------------
async def test_missing_api_key_raises_llmerror_without_making_a_request() -> None:
    gateway = NemotronGateway(settings=_settings(nvidia_api_key=""))
    with pytest.raises(LLMError, match="NVIDIA_API_KEY is not configured"):
        await gateway.generate_text("hello", None, 0.2)
    assert gateway._client is None


async def test_client_is_constructed_lazily_and_reused_across_calls() -> None:
    gateway = NemotronGateway(settings=_settings())
    assert gateway._client is None

    def handler(request: httpx.Request) -> httpx.Response:
        return _chat_response("generated response")

    gateway._client = httpx.AsyncClient(
        base_url=gateway._settings.nvidia_generation_base_url,
        transport=httpx.MockTransport(handler),
    )
    first_client = gateway._client
    await gateway.generate_text("hello", None, 0.2)
    await gateway.generate_text("hello again", None, 0.2)
    assert gateway._client is first_client


# ---------------------------------------------------------------------------
# generate_text -- request construction
# ---------------------------------------------------------------------------
async def test_generate_text_returns_the_response_text() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    result = await gateway.generate_text("What does this function do?", "Be concise.", 0.3)

    assert result == "generated response"
    request = captured[0]
    assert request.method == "POST"
    # Full path must resolve to the verified real endpoint
    # https://integrate.api.nvidia.com/v1/chat/completions -- base_url
    # already includes `/v1`, so this confirms the two join correctly.
    assert request.url.path == "/v1/chat/completions"
    body = _request_body(request)
    assert body["model"] == "nvidia/nemotron-3-ultra-550b-a55b"
    assert body["messages"] == [
        {"role": "system", "content": "Be concise."},
        {"role": "user", "content": "What does this function do?"},
    ]
    assert body["temperature"] == 0.3


async def test_generate_text_omits_system_message_when_none() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    await gateway.generate_text("prompt only", None, 0.2)

    body = _request_body(captured[0])
    assert body["messages"] == [{"role": "user", "content": "prompt only"}]


async def test_generate_text_applies_max_output_tokens_from_settings() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler, settings=_settings(nemotron_max_output_tokens=777))
    await gateway.generate_text("prompt", None, 0.5)

    body = _request_body(captured[0])
    assert body["max_tokens"] == 777


async def test_generate_text_always_disables_reasoning() -> None:
    """Live-measured (module docstring): disabling reasoning halves both
    latency and completion tokens for grounded repository-chat prompts
    with no loss of answer quality -- not a caller-supplied knob."""
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    await gateway.generate_text("prompt", None, 0.2)

    body = _request_body(captured[0])
    assert body["chat_template_kwargs"] == {"enable_thinking": False}


async def test_generate_text_ignores_reasoning_content_returns_only_answer() -> None:
    gateway = _gateway_with_transport(
        lambda r: _chat_response("the real answer", reasoning_content="internal chain of thought")
    )
    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "the real answer"
    assert "chain of thought" not in result


async def test_generate_text_raises_llmerror_when_response_has_no_content() -> None:
    gateway = _gateway_with_transport(lambda r: _chat_response(None))
    with pytest.raises(LLMError, match="Nemotron returned no text content"):
        await gateway.generate_text("prompt", None, 0.2)


async def test_generate_text_raises_llmerror_when_content_is_empty_string() -> None:
    gateway = _gateway_with_transport(lambda r: _chat_response(""))
    with pytest.raises(LLMError, match="Nemotron returned no text content"):
        await gateway.generate_text("prompt", None, 0.2)


# ---------------------------------------------------------------------------
# Authentication (§9, §26)
# ---------------------------------------------------------------------------
async def test_authorization_header_is_a_bearer_token_from_settings() -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return _chat_response("generated response")

    gateway = NemotronGateway(settings=_settings(nvidia_api_key="real-looking-key-123"))
    # Let `_get_client()` build the client for real (exercises the actual
    # header-construction code path), then swap only the transport.
    client = gateway._get_client()
    client._transport = httpx.MockTransport(handler)

    await gateway.generate_text("hello", None, 0.2)

    auth_header = captured[0].headers.get("authorization")
    assert auth_header == "Bearer real-looking-key-123"


# ---------------------------------------------------------------------------
# Malformed response handling (§25)
# ---------------------------------------------------------------------------
async def test_response_missing_choices_key_raises_llmerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "chatcmpl-fake"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError, match="malformed generation response"):
        await gateway.generate_text("prompt", None, 0.2)


async def test_response_with_empty_choices_list_raises_llmerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": []})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError, match="malformed generation response"):
        await gateway.generate_text("prompt", None, 0.2)


# ---------------------------------------------------------------------------
# HTTP error handling (§25)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status_code", [400, 401, 403, 500, 503])
async def test_http_error_status_codes_are_translated_to_llmerror(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": {"message": "provider error"}})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert not isinstance(exc_info.value, LLMRateLimitError)
    assert exc_info.value.details["status_code"] == status_code
    # The raw provider exception must never cross the boundary.
    assert not isinstance(exc_info.value, httpx.HTTPStatusError)


async def test_network_failure_is_translated_to_llmerror_without_retry() -> None:
    """Unlike a timeout, a connection-level failure (DNS, refused, reset)
    is not retried -- it is not the transient-stall profile the Task 60
    timeout retry was added for."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        raise httpx.ConnectError("connection refused", request=request)

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError, match="network/timeout"):
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 1


async def test_persistent_timeout_retries_once_then_raises_llmerror() -> None:
    """A timeout that never resolves must still fail eventually -- exactly
    one bounded retry (`_MAX_TIMEOUT_RETRIES = 1`), never unlimited."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        raise httpx.TimeoutException("timed out", request=request)

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError, match="network/timeout"):
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 2  # original attempt + exactly one retry, never more


# ---------------------------------------------------------------------------
# Timeout retry (Task 60 live finding): a real E2E test against NVIDIA's
# hosted API hit a genuine full-timeout stall that succeeded immediately
# on retry -- see gemini_client.py's module docstring for the full
# finding. Bounded to exactly one retry, separate from and much
# narrower than the 429 policy below (no exponential backoff wait,
# since the observed failure resolves -- or doesn't -- on the very next
# attempt, not after a delay).
# ---------------------------------------------------------------------------
async def test_timeout_retries_once_then_succeeds() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.TimeoutException("timed out", request=request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "generated response"
    assert call_count == 2


async def test_timeout_retry_reuses_the_same_prompt_and_settings() -> None:
    """The retried attempt must be identical to the first -- Task 60's
    live finding was that retrying the *same* request succeeded, not
    that a different request was needed."""
    captured: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(_request_body(request))
        if len(captured) == 1:
            raise httpx.TimeoutException("timed out", request=request)
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    await gateway.generate_text("What does maze.py do?", "system prompt", 0.2)

    assert len(captured) == 2
    assert captured[0] == captured[1]


# ---------------------------------------------------------------------------
# Transient 5xx retry (Task 61 live finding): a real E2E test against
# NVIDIA's hosted API hit a genuine `503 Service Unavailable` -- fast
# (0.42s server-side, not a timeout) -- that succeeded immediately on an
# identical retry. Bounded to exactly one extra attempt, sharing the
# SAME budget as the timeout retry above (never stacking to more than
# two total attempts) -- see `_run_with_retry`'s own docstring.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status_code", [500, 502, 503])
async def test_transient_5xx_retries_once_then_succeeds(status_code: int) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(status_code, json={"error": "server error"})
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "generated response"
    assert call_count == 2


async def test_persistent_503_retries_once_then_raises_llmerror() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(503, json={"error": "server error"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 2  # original attempt + exactly one retry, never more
    assert not isinstance(exc_info.value, LLMRateLimitError)
    assert exc_info.value.details["status_code"] == 503


@pytest.mark.parametrize("status_code", [401, 403, 404])
async def test_client_error_status_codes_never_retry(status_code: int) -> None:
    """401/403/404 are never transient -- retrying an invalid credential
    or a missing resource cannot fix it (module docstring's "Retry"
    section)."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(status_code, json={"error": "client error"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 1
    assert not isinstance(exc_info.value, LLMRateLimitError)
    assert exc_info.value.details["status_code"] == status_code


async def test_5xx_retry_reuses_the_same_prompt_and_settings() -> None:
    """Mirrors `test_timeout_retry_reuses_the_same_prompt_and_settings`
    -- the retried attempt must be identical to the first."""
    captured: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(_request_body(request))
        if len(captured) == 1:
            return httpx.Response(503, json={"error": "server error"})
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    await gateway.generate_text("What does maze.py do?", "system prompt", 0.2)

    assert len(captured) == 2
    assert captured[0] == captured[1]


async def test_timeout_then_5xx_never_exceeds_two_total_attempts() -> None:
    """The timeout retry and the 5xx retry share ONE bounded budget, not
    one each -- a timeout on attempt 1 followed by a 503 on attempt 2
    must still fail after exactly two attempts, never retry a third
    time (module docstring's "Retry" section: "a call can never exceed
    two real attempts even if it hits a timeout on attempt 1 and a 5xx
    on attempt 2")."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.TimeoutException("timed out", request=request)
        return httpx.Response(503, json={"error": "server error"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError):
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 2


async def test_5xx_then_timeout_never_exceeds_two_total_attempts() -> None:
    """Same shared-budget guarantee as above, triggers reversed: a 503
    on attempt 1 followed by a timeout on attempt 2 must still fail
    after exactly two attempts."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(502, json={"error": "server error"})
        raise httpx.TimeoutException("timed out", request=request)

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError):
        await gateway.generate_text("prompt", None, 0.2)

    assert call_count == 2


async def test_429_retry_is_unaffected_by_the_5xx_retry_addition() -> None:
    """Confirms Task 61 left the pre-existing 429 policy (up to 4
    attempts, exponential backoff) completely untouched -- a 5xx
    predicate match must never short-circuit or alter it."""
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 4:
            return httpx.Response(429, json={"error": "rate limited"})
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "generated response"
    assert call_count == 4


# ---------------------------------------------------------------------------
# 429 rate-limit retry -- the one failure mode this module retries,
# bounded (never unlimited), same narrow scope as NemotronEmbedder/
# RAGOptimizer (§25: "do not blindly retry every HTTP error").
# ---------------------------------------------------------------------------
async def test_rate_limit_429_retries_then_succeeds() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(429, json={"error": "rate limited"})
        return _chat_response("generated response")

    gateway = _gateway_with_transport(handler)
    result = await gateway.generate_text("prompt", None, 0.2)

    assert result == "generated response"
    assert call_count == 3


async def test_rate_limit_429_exhausts_retries_and_raises_llmratelimiterror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": "rate limited"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMRateLimitError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert exc_info.value.category.value == "rate_limit"
    assert exc_info.value.http_status == 429
    assert exc_info.value.retryable is True


async def test_non_rate_limit_client_error_translated_without_retry() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(400, json={"error": "bad request"})

    gateway = _gateway_with_transport(handler)
    with pytest.raises(LLMError) as exc_info:
        await gateway.generate_text("prompt", None, 0.2)

    assert not isinstance(exc_info.value, LLMRateLimitError)
    assert call_count == 1  # never retried


# ---------------------------------------------------------------------------
# count_tokens -- local estimate, no network call (module docstring: NVIDIA's
# hosted chat completions API has no token-counting endpoint)
# ---------------------------------------------------------------------------
async def test_count_tokens_never_makes_a_network_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("count_tokens must never make an HTTP request")

    gateway = _gateway_with_transport(handler)
    result = await gateway.count_tokens("some text to count")

    assert isinstance(result, int)
    assert result > 0


async def test_count_tokens_scales_with_text_length() -> None:
    gateway = NemotronGateway(settings=_settings())

    short = await gateway.count_tokens("hi")
    long = await gateway.count_tokens("a" * 400)

    assert long > short


async def test_count_tokens_returns_at_least_one_for_nonempty_text() -> None:
    gateway = NemotronGateway(settings=_settings())
    assert await gateway.count_tokens("x") >= 1


# ---------------------------------------------------------------------------
# close()
# ---------------------------------------------------------------------------
async def test_close_releases_the_client_and_is_idempotent() -> None:
    gateway = _gateway_with_transport(lambda r: _chat_response("ok"))
    await gateway.generate_text("prompt", None, 0.2)
    assert gateway._client is not None

    await gateway.close()
    assert gateway._client is None

    await gateway.close()  # must not raise when already closed
    assert gateway._client is None
