"""Unit tests for app/core/evolution/churn_calculator.py (Task 26).

Pure aggregation/ranking logic, no I/O -- no fakes/mocks needed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.evolution.churn_calculator import ChurnCalculator
from app.domain.enums import DocumentType
from app.domain.models import CommitAnalysisResult, Document

_REFERENCE_TIME = datetime(2026, 8, 10, tzinfo=UTC)


def _analysis(file_counts: dict[str, int]) -> CommitAnalysisResult:
    return CommitAnalysisResult(
        total_commits=sum(file_counts.values()),
        file_modification_counts=file_counts,
        file_modification_windows={},
        author_contributions=[],
        commit_type_counts={},
        reference_time=_REFERENCE_TIME,
    )


def _document(file_path: str, content: str) -> Document:
    return Document(
        repository_id="repo-1",
        commit_sha="sha-1",
        file_path=file_path,
        content=content,
        language="python",
        document_type=DocumentType.SOURCE_CODE,
    )


def _lines(n: int) -> str:
    return "\n".join(f"line {i}" for i in range(n))


def test_empty_commit_analysis_returns_empty_list() -> None:
    result = ChurnCalculator().calculate_hotspots(_analysis({}), [])

    assert result == []


def test_file_with_no_matching_document_is_skipped() -> None:
    analysis = _analysis({"src/missing.py": 5})

    result = ChurnCalculator().calculate_hotspots(analysis, [])

    assert result == []


def test_hotspot_metrics_carry_the_raw_commit_and_line_counts() -> None:
    analysis = _analysis({"src/app.py": 3})
    files = [_document("src/app.py", _lines(10))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert result[0].commit_count == 3
    assert result[0].line_count == 10


def test_single_candidate_gets_a_normalized_score_of_100() -> None:
    analysis = _analysis({"src/app.py": 2})
    files = [_document("src/app.py", _lines(5))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert result[0].hotspot_score == pytest.approx(100.0)


def test_highest_raw_score_file_is_normalized_to_100() -> None:
    analysis = _analysis({"src/big.py": 10, "src/small.py": 1})
    files = [_document("src/big.py", _lines(100)), _document("src/small.py", _lines(5))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    top = next(h for h in result if h.file_path == "src/big.py")
    assert top.hotspot_score == pytest.approx(100.0)


def test_scores_are_normalized_relative_to_the_max_not_absolute() -> None:
    # raw scores: big = 10*100 = 1000, small = 1*5 = 5 -> small should be
    # a tiny fraction of 100, not some absolute scale.
    analysis = _analysis({"src/big.py": 10, "src/small.py": 1})
    files = [_document("src/big.py", _lines(100)), _document("src/small.py", _lines(5))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    small = next(h for h in result if h.file_path == "src/small.py")
    assert small.hotspot_score == pytest.approx(0.5)  # 5 / 1000 * 100


def test_results_are_sorted_descending_by_hotspot_score() -> None:
    analysis = _analysis({"src/a.py": 1, "src/b.py": 10, "src/c.py": 5})
    files = [
        _document("src/a.py", _lines(10)),
        _document("src/b.py", _lines(10)),
        _document("src/c.py", _lines(10)),
    ]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert [h.file_path for h in result] == ["src/b.py", "src/c.py", "src/a.py"]


def test_top_n_defaults_to_ten() -> None:
    file_counts = {f"src/file{i}.py": i + 1 for i in range(12)}
    analysis = _analysis(file_counts)
    files = [_document(path, _lines(10)) for path in file_counts]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert len(result) == 10


def test_top_n_returns_the_actual_highest_scoring_files() -> None:
    file_counts = {f"src/file{i}.py": i + 1 for i in range(12)}
    analysis = _analysis(file_counts)
    files = [_document(path, _lines(10)) for path in file_counts]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert {h.file_path for h in result} == {
        "src/file2.py",
        "src/file3.py",
        "src/file4.py",
        "src/file5.py",
        "src/file6.py",
        "src/file7.py",
        "src/file8.py",
        "src/file9.py",
        "src/file10.py",
        "src/file11.py",
    }


def test_top_n_can_be_overridden() -> None:
    file_counts = {f"src/file{i}.py": i + 1 for i in range(5)}
    analysis = _analysis(file_counts)
    files = [_document(path, _lines(10)) for path in file_counts]

    result = ChurnCalculator().calculate_hotspots(analysis, files, top_n=2)

    assert len(result) == 2


def test_file_with_empty_content_has_zero_line_count_and_zero_score() -> None:
    analysis = _analysis({"src/empty.py": 5})
    files = [_document("src/empty.py", "")]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert result[0].line_count == 0
    assert result[0].hotspot_score == 0.0


def test_frequently_modified_large_file_ranks_above_rarely_modified_small_file() -> None:
    """§26 Validation: "frequently modified large files are correctly
    ranked at the top of hotspot results"."""
    analysis = _analysis({"src/hot.py": 20, "src/cold.py": 1})
    files = [_document("src/hot.py", _lines(500)), _document("src/cold.py", _lines(500))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert result[0].file_path == "src/hot.py"


def test_high_commit_count_alone_does_not_outrank_a_much_larger_file() -> None:
    """Common Mistakes: "treating raw commit count as hotspot risk
    without factoring file size/complexity" -- a tiny file committed
    often must not automatically outrank a huge file committed less."""
    analysis = _analysis({"src/tiny.py": 50, "src/huge.py": 5})
    files = [_document("src/tiny.py", _lines(2)), _document("src/huge.py", _lines(1000))]

    result = ChurnCalculator().calculate_hotspots(analysis, files)

    assert result[0].file_path == "src/huge.py"
