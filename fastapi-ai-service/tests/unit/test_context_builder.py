"""Unit tests for app/core/retrieval/context_builder.py (Task 21).

Uses a real `GeminiGateway` instance with `count_tokens` monkeypatched
to a controllable fake counter (same pattern as tests/unit/test_retriever.py)
-- exercises `ContextBuilder`'s own packing/truncation/citation-mapping
logic without calling the real Gemini API.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.core.retrieval.context_builder import _REFERENCE_DATA_LABEL, ContextBuilder
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import ChunkMetadata, Citation, SearchResultItem
from app.infra.llm.gemini_client import GeminiGateway


def _chunk(
    chunk_id: str,
    content: str,
    file_path: str = "src/app.py",
    start_line: int = 10,
    end_line: int = 45,
) -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content=content,
        score=0.9,
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


class Harness:
    def __init__(self) -> None:
        self.token_calls: list[str] = []
        self.gateway = GeminiGateway(settings=Settings())

    def wire(self, monkeypatch: pytest.MonkeyPatch, costs: list[int]) -> ContextBuilder:
        queue = list(costs)

        async def _count_tokens(text: str) -> int:
            self.token_calls.append(text)
            return queue.pop(0)

        monkeypatch.setattr(self.gateway, "count_tokens", _count_tokens)
        return ContextBuilder(gemini_gateway=self.gateway)


@pytest.fixture
def harness() -> Harness:
    return Harness()


async def test_all_chunks_fit_within_budget_are_all_included_with_no_truncation(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100, 100])
    chunks = [_chunk("c1", "alpha"), _chunk("c2", "beta")]

    result = await builder.build_context(chunks, max_token_budget=1000)

    assert result.truncated is False
    assert result.token_count == 210
    assert set(result.citation_map) == {1, 2}


async def test_budget_exceeded_stops_before_the_overflowing_chunk(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100, 100])
    chunks = [_chunk("c1", "alpha"), _chunk("c2", "beta")]

    result = await builder.build_context(chunks, max_token_budget=150)

    assert result.truncated is True
    assert set(result.citation_map) == {1}
    assert result.token_count == 110


async def test_stops_at_first_overflow_rather_than_skipping_ahead_to_a_smaller_chunk(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    # chunk1 alone (with the label) already exceeds budget; chunk2 would
    # fit on its own, but must never be considered once packing halts.
    builder = harness.wire(monkeypatch, costs=[10, 200, 5])
    chunks = [_chunk("c1", "alpha"), _chunk("c2", "beta")]

    result = await builder.build_context(chunks, max_token_budget=100)

    assert result.truncated is True
    assert result.citation_map == {}
    # Only the label and chunk1 were ever measured -- chunk2 was never reached.
    assert len(harness.token_calls) == 2


async def test_citation_map_entries_match_chunk_metadata(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100])
    chunks = [_chunk("c1", "alpha", file_path="src/auth.py", start_line=10, end_line=45)]

    result = await builder.build_context(chunks, max_token_budget=1000)

    assert result.citation_map[1] == Citation(
        file_path="src/auth.py", start_line=10, end_line=45, chunk_id="c1"
    )


async def test_empty_chunks_list_returns_label_only_text_with_no_truncation(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10])

    result = await builder.build_context([], max_token_budget=1000)

    assert result.text == _REFERENCE_DATA_LABEL
    assert result.citation_map == {}
    assert result.truncated is False
    assert result.token_count == 10


async def test_text_contains_formatted_file_and_line_header(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100])
    chunks = [
        _chunk("c1", "def authenticate(): ...", file_path="src/auth.py", start_line=10, end_line=45)
    ]

    result = await builder.build_context(chunks, max_token_budget=1000)

    assert "[1] File: src/auth.py (Lines 10-45)" in result.text
    assert "def authenticate(): ..." in result.text


async def test_reference_data_label_is_the_first_line_of_the_packed_text(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100])
    chunks = [_chunk("c1", "alpha")]

    result = await builder.build_context(chunks, max_token_budget=1000)

    assert result.text.startswith(_REFERENCE_DATA_LABEL)


async def test_citation_indices_are_1_based_and_track_rank_order(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    builder = harness.wire(monkeypatch, costs=[10, 100, 100, 100])
    chunks = [_chunk("first", "a"), _chunk("second", "b"), _chunk("third", "c")]

    result = await builder.build_context(chunks, max_token_budget=1000)

    assert result.citation_map[1].chunk_id == "first"
    assert result.citation_map[2].chunk_id == "second"
    assert result.citation_map[3].chunk_id == "third"
