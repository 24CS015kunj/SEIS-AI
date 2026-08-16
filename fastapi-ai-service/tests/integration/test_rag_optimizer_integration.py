"""Integration test for app/core/retrieval/rag_optimizer.py (Task 24).

Requires a real NVIDIA API key (``NVIDIA_API_KEY``) -- there is no free,
local, self-hostable substitute for NVIDIA's hosted reranking API (same
reasoning as tests/integration/test_embedder_integration.py). If no key
is configured in this environment/session, this module is skipped with
an explicit reason, never a fabricated pass.

Makes real, billable (or free-tier) HTTPS calls to
``https://integrate.api.nvidia.com/v1/ranking`` per test run. The API
key is read only via ``Settings``/``get_secret_value()``; it is never
printed, logged, or otherwise included in any assertion or failure
message here.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings, get_settings
from app.core.retrieval.rag_optimizer import RERANKING_MODEL_NAME, RAGOptimizer
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import ChunkMetadata, SearchResultItem

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "No NVIDIA_API_KEY configured in this environment. Set it in "
        "fastapi-ai-service/.env (see .env.example) and re-run to verify "
        "against the real NVIDIA hosted reranking API."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


def _item(chunk_id: str, content: str, file_path: str) -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content=content,
        score=0.5,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path=file_path,
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )


async def test_rerank_chunks_against_the_real_nvidia_api(settings: Settings) -> None:
    optimizer = RAGOptimizer(settings=settings)
    chunks = [
        _item(
            "auth",
            "def authenticate(user, password):\n    return check(user, password)\n",
            "src/auth.py",
        ),
        _item("math", "def add(a, b):\n    return a + b\n", "src/math_utils.py"),
    ]

    result = await optimizer.rerank_chunks("how does authentication work?", chunks, top_k=2)

    assert len(result) == 2
    for item in result:
        assert 0.0 <= item.score <= 1.0


async def test_relevant_passage_is_ranked_above_an_irrelevant_one_against_the_real_api(
    settings: Settings,
) -> None:
    """§20 Validation: "reranked chunk list exhibits higher precision for
    technical code queries" -- verified against the real cross-encoder,
    not simulated, using two clearly distinguishable candidates."""
    optimizer = RAGOptimizer(settings=settings)
    chunks = [
        _item("math", "def add(a, b):\n    return a + b\n", "src/math_utils.py"),
        _item(
            "auth",
            "def authenticate(user, password):\n    return check_credentials(user, password)\n",
            "src/auth.py",
        ),
    ]

    result = await optimizer.rerank_chunks("how does user authentication work?", chunks, top_k=2)

    assert result[0].chunk_id == "auth"
    assert result[0].score > result[1].score


def test_reranking_model_name_matches_the_verified_current_model() -> None:
    assert RERANKING_MODEL_NAME == "nvidia/llama-nemotron-rerank-1b-v2"
