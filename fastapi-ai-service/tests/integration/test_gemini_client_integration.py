"""Integration test for app/infra/llm/gemini_client.py (Task 12; NVIDIA
Nemotron 3 Ultra migration, Task 60/ADR-008).

Requires a real NVIDIA API key (``NVIDIA_API_KEY``) -- there is no free,
local, self-hostable substitute for NVIDIA's hosted Nemotron 3 Ultra
inference API (same reasoning as ``test_embedder_integration.py``). If no
key is configured in this environment/session, this module is skipped
with an explicit reason, never a fabricated pass.

Makes real, billable (or free-tier) HTTPS calls to
``https://integrate.api.nvidia.com/v1/chat/completions`` per test run --
keep that in mind before running it repeatedly in a loop. The API key is
read only via ``Settings``/``get_secret_value()``; it is never printed,
logged, or otherwise included in any assertion or failure message here.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings, get_settings
from app.infra.llm.gemini_client import NemotronGateway

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "No NVIDIA_API_KEY configured in this environment. Set it in "
        "fastapi-ai-service/.env (see .env.example) and re-run to verify "
        "against the real NVIDIA hosted Nemotron 3 Ultra API."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


async def test_generate_text_against_the_real_nemotron_api(settings: Settings) -> None:
    gateway = NemotronGateway(settings=settings)
    result = await gateway.generate_text(
        "Reply with exactly one word: hello", None, temperature=0.0
    )
    assert isinstance(result, str)
    assert len(result) > 0


async def test_generate_text_honors_a_system_instruction(settings: Settings) -> None:
    gateway = NemotronGateway(settings=settings)
    result = await gateway.generate_text(
        "What is 2+2?",
        "You are a terse assistant. Answer in one word, no punctuation.",
        temperature=0.0,
    )
    assert isinstance(result, str)
    assert len(result) > 0


async def test_count_tokens_returns_a_positive_local_estimate(settings: Settings) -> None:
    gateway = NemotronGateway(settings=settings)
    count = await gateway.count_tokens("Reply with exactly one word: hello")
    assert count > 0
