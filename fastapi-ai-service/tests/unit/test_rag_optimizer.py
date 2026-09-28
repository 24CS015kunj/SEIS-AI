"""Unit tests for app/core/retrieval/rag_optimizer.py (Task 24).

Reranking tests use a real `RAGOptimizer` instance whose lazily-built
`httpx.AsyncClient` is pre-seeded with `httpx.MockTransport` -- the same
"construct real instances, substitute the minimum necessary for
determinism" pattern already used in tests/unit/test_embedder.py.
`expand_query` is pure, dependency-free logic and needs no transport.
Live-API verification is covered separately by
tests/integration/test_rag_optimizer_integration.py, gated on a real
NVIDIA_API_KEY.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.config.settings import Settings
from app.core.retrieval.rag_optimizer import RERANKING_MODEL_NAME, RAGOptimizer
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import RerankError
from app.domain.models import ChunkMetadata, SearchResultItem


def _settings(**overrides: Any) -> Settings:
    defaults: dict[str, Any] = {"nvidia_embedding_api_key": "fake-test-key"}
    defaults.update(overrides)
    return Settings(**defaults)


def _item(
    chunk_id: str,
    content: str,
    score: float = 0.5,
    file_path: str = "src/app.py",
    start_line: int = 1,
    end_line: int = 2,
) -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content=content,
        score=score,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path=file_path,
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=start_line,
            end_line=end_line,
        ),
    )


def _rerank_response(
    logits: list[float], indices: list[int] | None = None, *, status_code: int = 200
) -> httpx.Response:
    order = indices if indices is not None else list(range(len(logits)))
    body = {
        "rankings": [{"index": i, "logit": logit} for i, logit in zip(order, logits, strict=True)],
        "usage": {"prompt_tokens": 1, "total_tokens": 1},
    }
    return httpx.Response(
        status_code,
        content=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
    )


def _optimizer_with_transport(
    handler: Callable[[httpx.Request], httpx.Response], settings: Settings | None = None
) -> RAGOptimizer:
    optimizer = RAGOptimizer(settings=settings or _settings())
    client = optimizer._get_client()  # noqa: SLF001 -- test seam, same pattern as test_embedder.py
    client._transport = httpx.MockTransport(handler)
    return optimizer


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# ----------------------------------------------------------------------
# expand_query -- pure logic, no HTTP client involved.
# ----------------------------------------------------------------------


def test_original_query_is_always_the_first_variant() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("how does auth work")

    assert variants[0] == "how does auth work"


def test_camel_case_identifier_is_split_into_a_second_variant() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("getUserById")

    assert "get User By Id" in variants


def test_snake_case_identifier_is_split_into_a_variant() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("auth_helper_module")

    assert "auth helper module" in variants


def test_filler_prefix_is_stripped_into_a_variant() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("How does authentication work?")

    assert "authentication work" in variants


def test_no_duplicate_variant_when_split_matches_the_original() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("plain lowercase words")

    assert variants == ["plain lowercase words"]


def test_filler_only_query_does_not_produce_an_empty_variant() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("How does ")

    assert "" not in variants


def test_variant_order_is_original_then_split_then_filler_stripped() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    variants = optimizer.expand_query("How does getUserById work?")

    assert variants[0] == "How does getUserById work?"
    assert variants[1] == "How does get User By Id work?"
    assert variants[2] == "getUserById work"


# ----------------------------------------------------------------------
# rerank_chunks -- real HTTP request/response handling via MockTransport.
# ----------------------------------------------------------------------


async def test_missing_api_key_raises_rerankerror_without_making_a_request() -> None:
    optimizer = RAGOptimizer(settings=_settings(nvidia_embedding_api_key=""))

    with pytest.raises(RerankError, match="NVIDIA_EMBEDDING_API_KEY"):
        await optimizer.rerank_chunks("query", [_item("c1", "content")])


async def test_rerank_sends_the_documented_request_shape() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["body"] = json.loads(request.content)
        return _rerank_response([0.0])

    optimizer = _optimizer_with_transport(handler)
    await optimizer.rerank_chunks("auth query", [_item("c1", "def authenticate(): ...")])

    assert captured["path"] == "/v1/retrieval/nvidia/llama-nemotron-rerank-vl-1b-v2/reranking"
    assert captured["body"] == {
        "model": RERANKING_MODEL_NAME,
        "query": {"text": "auth query"},
        "passages": [{"text": "def authenticate(): ..."}],
        "truncate": "END",
    }


async def test_authorization_header_is_a_bearer_token_from_settings() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        return _rerank_response([0.0])

    optimizer = _optimizer_with_transport(
        handler, settings=_settings(nvidia_embedding_api_key="super-secret-key")
    )
    await optimizer.rerank_chunks("q", [_item("c1", "x")])

    assert captured["auth"] == "Bearer super-secret-key"


async def test_scores_are_replaced_with_the_sigmoid_of_the_logit() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([0.0])

    optimizer = _optimizer_with_transport(handler)
    result = await optimizer.rerank_chunks("q", [_item("c1", "x", score=0.9)])

    assert result[0].score == pytest.approx(0.5)  # sigmoid(0) == 0.5


async def test_chunks_are_resorted_by_the_new_score_descending() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([-5.0, 5.0, 0.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [_item("low", "a"), _item("high", "b"), _item("mid", "c")]
    result = await optimizer.rerank_chunks("q", chunks, top_k=3)

    assert [item.chunk_id for item in result] == ["high", "mid", "low"]


async def test_logits_are_placed_by_response_index_not_response_order() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # Deliberately out-of-order: chunk index 1 ("second") gets the
        # highest logit even though it appears second in the request.
        return _rerank_response([10.0, -10.0], indices=[1, 0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [_item("first", "a"), _item("second", "b")]
    result = await optimizer.rerank_chunks("q", chunks, top_k=2)

    assert result[0].chunk_id == "second"
    assert result[1].chunk_id == "first"


async def test_returns_only_top_k_after_resorting() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([1.0, 3.0, 2.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [_item("a", "a"), _item("b", "b"), _item("c", "c")]
    result = await optimizer.rerank_chunks("q", chunks, top_k=2)

    assert [item.chunk_id for item in result] == ["b", "c"]


async def test_top_k_defaults_to_five() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([float(i) for i in range(7)])

    optimizer = _optimizer_with_transport(handler)
    chunks = [_item(str(i), str(i)) for i in range(7)]
    result = await optimizer.rerank_chunks("q", chunks)

    assert len(result) == 5


async def test_rejects_non_positive_top_k() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    with pytest.raises(ValueError, match="top_k"):
        await optimizer.rerank_chunks("q", [_item("c1", "x")], top_k=0)


async def test_rejects_non_positive_max_chunks_per_file() -> None:
    optimizer = RAGOptimizer(settings=_settings())

    with pytest.raises(ValueError, match="max_chunks_per_file"):
        await optimizer.rerank_chunks("q", [_item("c1", "x")], max_chunks_per_file=0)


# ---------------------------------------------------------------------------
# File-diversity selection (Task 60, dedicated tests added Task 61) --
# see `rerank_chunks`/`_select_diverse`'s own docstrings for the real,
# live-evidenced failure this fixes: the cross-encoder repeatedly
# concentrated the top-5 on one file (usually `readme.md`), crowding out
# a chunk from a different file the question specifically needed.
# ---------------------------------------------------------------------------
async def test_multiple_chunks_from_one_file_do_not_crowd_out_other_files() -> None:
    """3 chunks from file A outrank everything else, but 4 other distinct
    files exist -- the diversity cap must promote them into the top-5
    instead of returning A, A, A, B, C."""

    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([6.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [
        _item("a1", "a1", file_path="fileA.py"),
        _item("a2", "a2", file_path="fileA.py"),
        _item("a3", "a3", file_path="fileA.py"),
        _item("b1", "b1", file_path="fileB.py"),
        _item("c1", "c1", file_path="fileC.py"),
        _item("d1", "d1", file_path="fileD.py"),
        _item("e1", "e1", file_path="fileE.py"),
    ]

    result = await optimizer.rerank_chunks("q", chunks, top_k=5)

    ids = [item.chunk_id for item in result]
    assert len(ids) == 5
    assert ids.count("a1") + ids.count("a2") + ids.count("a3") == 1  # only one of A's 3 chunks
    assert {"b1", "c1", "d1", "e1"}.issubset(set(ids))
    # The highest-scored chunk overall (a1) is still the one A chunk kept.
    assert "a1" in ids


async def test_fewer_distinct_files_than_top_k_backfills_from_the_same_files() -> None:
    """Only 2 distinct files exist among 5 candidates -- the diversity
    cap must not needlessly drop chunks just because they share a file;
    all 5 legitimate candidates should still come back."""

    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([5.0, 4.0, 3.0, 2.0, 1.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [
        _item("a1", "a1", file_path="fileA.py"),
        _item("a2", "a2", file_path="fileA.py"),
        _item("a3", "a3", file_path="fileA.py"),
        _item("b1", "b1", file_path="fileB.py"),
        _item("b2", "b2", file_path="fileB.py"),
    ]

    result = await optimizer.rerank_chunks("q", chunks, top_k=5)

    assert {item.chunk_id for item in result} == {"a1", "a2", "a3", "b1", "b2"}


async def test_exactly_five_distinct_files_returns_one_chunk_each() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([5.0, 4.0, 3.0, 2.0, 1.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [
        _item("a1", "a1", file_path="fileA.py"),
        _item("b1", "b1", file_path="fileB.py"),
        _item("c1", "c1", file_path="fileC.py"),
        _item("d1", "d1", file_path="fileD.py"),
        _item("e1", "e1", file_path="fileE.py"),
    ]

    result = await optimizer.rerank_chunks("q", chunks, top_k=5)

    assert len(result) == 5
    assert len({item.metadata.file_path for item in result}) == 5


async def test_single_file_question_still_returns_a_full_top_k() -> None:
    """Every real candidate comes from the same file (the real-world
    "what is this repository about?" case, where every relevant chunk is
    from readme.md) -- the diversity cap must gracefully backfill rather
    than returning fewer than top_k results just because nothing else
    exists to diversify with."""

    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([6.0, 5.0, 4.0, 3.0, 2.0, 1.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [_item(f"c{i}", f"content {i}", file_path="readme.md") for i in range(6)]

    result = await optimizer.rerank_chunks("q", chunks, top_k=5)

    assert len(result) == 5
    assert all(item.metadata.file_path == "readme.md" for item in result)


async def test_diverse_selection_still_prefers_higher_ranked_chunks() -> None:
    """Ranking is preserved as much as possible: among the chunks that
    survive diversity selection, higher cross-encoder scores still come
    first -- diversity changes *which* chunks are chosen, never the
    relevance order they're returned in."""

    def handler(request: httpx.Request) -> httpx.Response:
        # a1=10 (kept), a2=9 (capped out), b1=8 (kept), a3=7 (capped
        # out), c1=6 (kept) -- top_k=3 is reached without ever needing
        # to backfill a capped-out chunk.
        return _rerank_response([10.0, 9.0, 8.0, 7.0, 6.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [
        _item("a1", "a1", file_path="fileA.py"),
        _item("a2", "a2", file_path="fileA.py"),
        _item("b1", "b1", file_path="fileB.py"),
        _item("a3", "a3", file_path="fileA.py"),
        _item("c1", "c1", file_path="fileC.py"),
    ]

    result = await optimizer.rerank_chunks("q", chunks, top_k=3)

    assert [item.chunk_id for item in result] == ["a1", "b1", "c1"]
    assert [item.score for item in result] == sorted((item.score for item in result), reverse=True)


async def test_diversity_uses_the_existing_file_path_metadata_field() -> None:
    """File identification must use `metadata.file_path` -- the field
    the rest of the codebase (ContextBuilder, CitationEngine) already
    keys off -- not chunk_id, content, or any new field. Two chunks
    sharing a file_path are capped together even with unrelated
    chunk_ids; two chunks with different file_paths are never capped
    together even with similar-looking chunk_ids."""

    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([4.0, 3.0, 2.0, 1.0])

    optimizer = _optimizer_with_transport(handler)
    chunks = [
        _item("zz-unrelated-id", "x", file_path="same.py"),
        _item("aa-another-id", "y", file_path="same.py"),
        _item("same.py", "z", file_path="different.py"),  # chunk_id looks like a file_path
        _item("bb-id", "w", file_path="another.py"),
    ]

    # top_k=3, not 4: with 3 distinct files and cap=1, pass 1 alone
    # already fills all 3 slots -- if file identification incorrectly
    # keyed off chunk_id (or anything else), a different chunk would be
    # excluded than the one this test expects.
    result = await optimizer.rerank_chunks("q", chunks, top_k=3)

    ids = [item.chunk_id for item in result]
    assert len(ids) == 3
    assert "zz-unrelated-id" in ids  # highest-scored of the same.py pair
    assert "aa-another-id" not in ids  # capped out: same file_path as zz
    assert "same.py" in ids  # different.py's chunk -- file_path differs, never capped
    assert "bb-id" in ids


async def test_empty_chunks_list_returns_empty_without_a_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request should be made for an empty chunk list")

    optimizer = _optimizer_with_transport(handler)
    result = await optimizer.rerank_chunks("q", [])

    assert result == []


async def test_original_chunks_are_not_mutated() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([9.0])

    optimizer = _optimizer_with_transport(handler)
    original = _item("c1", "x", score=0.1)
    await optimizer.rerank_chunks("q", [original])

    assert original.score == 0.1


async def test_fewer_rankings_than_passages_raises_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([1.0])  # only 1 ranking for 2 passages

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a"), _item("c2", "b")])


async def test_out_of_range_index_raises_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _rerank_response([1.0], indices=[5])

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


async def test_response_missing_rankings_key_raises_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=json.dumps({"usage": {}}).encode(),
            headers={"content-type": "application/json"},
        )

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


@pytest.mark.parametrize("status_code", [400, 401, 403, 500, 503])
async def test_http_error_status_codes_are_translated_to_rerankerror(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code, content=b"{}", headers={"content-type": "application/json"}
        )

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


async def test_network_failure_is_translated_to_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


async def test_timeout_is_translated_to_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


async def test_rate_limit_429_retries_then_succeeds() -> None:
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        if attempts["count"] < 3:
            return httpx.Response(429, content=b"{}", headers={"content-type": "application/json"})
        return _rerank_response([1.0])

    optimizer = _optimizer_with_transport(handler)
    result = await optimizer.rerank_chunks("q", [_item("c1", "a")])

    assert attempts["count"] == 3
    assert result[0].score == pytest.approx(_sigmoid(1.0))


async def test_rate_limit_429_exhausts_retries_and_raises_rerankerror() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, content=b"{}", headers={"content-type": "application/json"})

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])


async def test_non_429_client_error_is_translated_without_retry() -> None:
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(400, content=b"{}", headers={"content-type": "application/json"})

    optimizer = _optimizer_with_transport(handler)

    with pytest.raises(RerankError):
        await optimizer.rerank_chunks("q", [_item("c1", "a")])

    assert attempts["count"] == 1
