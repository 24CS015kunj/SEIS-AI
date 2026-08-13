"""Unit tests for app/core/generation/citation_engine.py (Task 23).

Pure parsing/validation logic, no I/O -- no fakes/mocks needed beyond
the domain models themselves.
"""

from __future__ import annotations

from app.core.generation.citation_engine import CitationEngine
from app.domain.models import Citation


def _citation(chunk_id: str, file_path: str = "src/auth.py") -> Citation:
    return Citation(file_path=file_path, start_line=10, end_line=20, chunk_id=chunk_id)


def test_valid_citation_tag_resolves_to_its_citation() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    _, citations = engine.extract_citations("Auth is handled here [1].", citation_map)

    assert citations == [_citation("c1")]


def test_valid_citation_tag_is_left_in_the_returned_text() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, _ = engine.extract_citations("Auth is handled here [1].", citation_map)

    assert text == "Auth is handled here [1]."


def test_citation_tag_not_in_the_map_is_rejected() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    _, citations = engine.extract_citations("Auth is handled here [7].", citation_map)

    assert citations == []


def test_invalid_citation_tag_is_stripped_from_the_returned_text() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, _ = engine.extract_citations("Auth is handled here [7].", citation_map)

    assert "[7]" not in text
    assert text == "Auth is handled here."


def test_stripping_an_invalid_tag_does_not_leave_a_double_space() -> None:
    citation_map: dict[int, Citation] = {}
    engine = CitationEngine()

    text, _ = engine.extract_citations("Uses OAuth2 [5] for login.", citation_map)

    assert "  " not in text
    assert text == "Uses OAuth2 for login."


def test_mixed_valid_and_invalid_tags_keeps_only_the_valid_one() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations("See [1] and also [9].", citation_map)

    assert "[1]" in text
    assert "[9]" not in text
    assert citations == [_citation("c1")]


def test_repeated_valid_tag_is_returned_once_but_left_in_text_every_time() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations("[1] and again [1].", citation_map)

    assert citations == [_citation("c1")]
    assert text.count("[1]") == 2


def test_multiple_distinct_valid_citations_are_returned_in_order_of_first_appearance() -> None:
    citation_map = {1: _citation("c1"), 2: _citation("c2"), 3: _citation("c3")}
    engine = CitationEngine()

    _, citations = engine.extract_citations("First [2], then [3], then [1].", citation_map)

    assert [c.chunk_id for c in citations] == ["c2", "c3", "c1"]


def test_response_with_no_citation_tags_returns_text_unchanged_and_no_citations() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations(
        "I do not know based on the provided repository context.", citation_map
    )

    assert text == "I do not know based on the provided repository context."
    assert citations == []


def test_bracketed_non_numeric_text_is_left_untouched() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations("See [file:auth.py] for details.", citation_map)

    assert text == "See [file:auth.py] for details."
    assert citations == []


def test_markdown_link_syntax_is_not_treated_as_a_citation_tag() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations("See [our docs](https://example.com).", citation_map)

    assert text == "See [our docs](https://example.com)."
    assert citations == []


def test_empty_citation_map_rejects_every_tag() -> None:
    citation_map: dict[int, Citation] = {}
    engine = CitationEngine()

    text, citations = engine.extract_citations("Explained in [1] and [2].", citation_map)

    assert citations == []
    assert "[1]" not in text
    assert "[2]" not in text


def test_empty_response_returns_empty_text_and_no_citations() -> None:
    citation_map = {1: _citation("c1")}
    engine = CitationEngine()

    text, citations = engine.extract_citations("", citation_map)

    assert text == ""
    assert citations == []
