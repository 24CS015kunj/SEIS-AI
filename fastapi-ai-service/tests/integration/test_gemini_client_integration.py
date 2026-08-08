"""Integration test for app/infra/llm/gemini_client.py (Task 12).

Requires a real Gemini API key (``GEMINI_API_KEY``) — unlike Tasks
9-11's Redis/Celery, there is no free, local, self-hostable substitute
for the Gemini API itself to spin up in Docker. No API key was
available in this environment/session, so this module is skipped here
with an explicit reason, not a fabricated pass. It will run for real
the moment a developer sets ``GEMINI_API_KEY`` in their local `.env`.

This makes exactly one real, billable (or free-tier) call to the
Gemini API per test run — keep that in mind before running it
repeatedly in a loop.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings, get_settings
from app.infra.llm.gemini_client import GeminiGateway

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _settings_for_skip_check.gemini_api_key.get_secret_value(),
    reason=(
        "No GEMINI_API_KEY configured in this environment. Set it in "
        "fastapi-ai-service/.env (see .env.example) and re-run to verify "
        "against the real Gemini API."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


async def test_generate_text_against_the_real_gemini_api(settings: Settings) -> None:
    gateway = GeminiGateway(settings=settings)
    result = await gateway.generate_text(
        "Reply with exactly one word: hello", None, temperature=0.0
    )
    assert isinstance(result, str)
    assert len(result) > 0


async def test_count_tokens_against_the_real_gemini_api(settings: Settings) -> None:
    gateway = GeminiGateway(settings=settings)
    count = await gateway.count_tokens("Reply with exactly one word: hello")
    assert count > 0
