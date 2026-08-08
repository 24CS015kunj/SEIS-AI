"""Integration test for app/core/embedding/embedder.py (Task 15).

Requires a real Gemini API key (``GEMINI_API_KEY``) -- same reasoning
as Task 12's integration test: there is no free, local, self-hostable
substitute for the Gemini Embeddings API. No API key was available in
this environment/session, so this module is skipped here with an
explicit reason, not a fabricated pass.

Makes real, billable (or free-tier) calls to the Gemini API per test
run -- keep that in mind before running it repeatedly in a loop.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import GeminiEmbedder
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _settings_for_skip_check.gemini_api_key.get_secret_value(),
    reason=(
        "No GEMINI_API_KEY configured in this environment. Set it in "
        "fastapi-ai-service/.env (see .env.example) and re-run to verify "
        "against the real Gemini Embeddings API."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


async def test_embed_chunks_against_the_real_gemini_api(settings: Settings) -> None:
    embedder = GeminiEmbedder(settings=settings)
    chunk = Chunk(
        chunk_id="c1",
        content="def add(a, b):\n    return a + b\n",
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

    vectors = await embedder.embed_chunks([chunk])

    assert len(vectors) == 1
    assert len(vectors[0]) == 768


async def test_embed_query_against_the_real_gemini_api(settings: Settings) -> None:
    embedder = GeminiEmbedder(settings=settings)
    vector = await embedder.embed_query("how does authentication work?")
    assert len(vector) == 768
