"""Integration test for app/core/embedding/embedder.py (NVIDIA Nemotron migration).

Requires a real NVIDIA API key (``NVIDIA_API_KEY``) -- there is no free,
local, self-hostable substitute for NVIDIA's hosted Nemotron-3-Embed-1B
inference API (same reasoning as Task 12/15's Gemini integration tests).
If no key is configured in this environment/session, this module is
skipped with an explicit reason, never a fabricated pass.

Makes real, billable (or free-tier) HTTPS calls to
``https://integrate.api.nvidia.com/v1/embeddings`` per test run -- keep
that in mind before running it repeatedly in a loop. The API key is read
only via ``Settings``/``get_secret_value()``; it is never printed,
logged, or otherwise included in any assertion or failure message here.
"""

from __future__ import annotations

import math

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import EMBEDDING_MODEL_NAME, NemotronEmbedder
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata

_EXPECTED_DIMENSION = 2048

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "No NVIDIA_API_KEY configured in this environment. Set it in "
        "fastapi-ai-service/.env (see .env.example) and re-run to verify "
        "against the real NVIDIA hosted Nemotron-3-Embed-1B API."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


def _assert_valid_vector(vector: list[float]) -> None:
    assert len(vector) == _EXPECTED_DIMENSION
    assert all(math.isfinite(value) for value in vector)


async def test_embed_chunks_against_the_real_nvidia_api(settings: Settings) -> None:
    embedder = NemotronEmbedder(settings=settings)
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
    _assert_valid_vector(vectors[0])


async def test_embed_query_against_the_real_nvidia_api(settings: Settings) -> None:
    embedder = NemotronEmbedder(settings=settings)
    vector = await embedder.embed_query("how does authentication work?")
    _assert_valid_vector(vector)


async def test_query_and_passage_embeddings_share_the_same_dimension(settings: Settings) -> None:
    """§11: "The query embedding dimension must exactly match the stored
    document embedding dimension" -- verified against the real API for
    both input_type modes in the same test run."""
    embedder = NemotronEmbedder(settings=settings)
    chunk = Chunk(
        chunk_id="c1",
        content="class Repository:\n    pass\n",
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path="src/models.py",
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_CLASS,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )

    passage_vector = (await embedder.embed_chunks([chunk]))[0]
    query_vector = await embedder.embed_query("what is Repository?")

    assert len(passage_vector) == len(query_vector) == _EXPECTED_DIMENSION


async def test_batched_chunks_preserve_input_order_against_the_real_api(
    settings: Settings,
) -> None:
    """§10: "Preserve input order... do not silently reorder vectors" --
    verified end-to-end against the real API by embedding clearly
    distinguishable content and confirming each result is closer to its
    own query than to the others (a real semantic signal, not just a
    shape check)."""
    embedder = NemotronEmbedder(settings=settings)
    chunks = [
        Chunk(
            chunk_id="auth",
            content=(
                "def authenticate(user, password):\n"
                "    return check_credentials(user, password)\n"
            ),
            metadata=ChunkMetadata(
                repository_id="repo-1",
                file_path="src/auth.py",
                language="python",
                commit_sha="sha-1",
                chunk_type=ChunkType.CODE_FUNCTION,
                document_type=DocumentType.SOURCE_CODE,
                start_line=1,
                end_line=2,
            ),
        ),
        Chunk(
            chunk_id="math",
            content="def add(a, b):\n    return a + b\n",
            metadata=ChunkMetadata(
                repository_id="repo-1",
                file_path="src/math_utils.py",
                language="python",
                commit_sha="sha-1",
                chunk_type=ChunkType.CODE_FUNCTION,
                document_type=DocumentType.SOURCE_CODE,
                start_line=1,
                end_line=2,
            ),
        ),
    ]

    vectors = await embedder.embed_chunks(chunks, batch_size=2)

    assert len(vectors) == 2
    for vector in vectors:
        _assert_valid_vector(vector)

    def _cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b, strict=True))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        return dot / (norm_a * norm_b)

    auth_query = await embedder.embed_query("how does authentication work?")
    math_query = await embedder.embed_query("how do I add two numbers?")

    auth_vector, math_vector = vectors
    # The auth chunk (index 0) must be more similar to the auth query
    # than the math chunk is -- and vice versa -- proving `vectors[0]`
    # genuinely corresponds to `chunks[0]` (order was not silently
    # scrambled by the API or by this module).
    assert _cosine(auth_query, auth_vector) > _cosine(auth_query, math_vector)
    assert _cosine(math_query, math_vector) > _cosine(math_query, auth_query)


def test_embedding_model_name_matches_the_final_migration_decision() -> None:
    assert EMBEDDING_MODEL_NAME == "nvidia/nemotron-3-embed-1b"
