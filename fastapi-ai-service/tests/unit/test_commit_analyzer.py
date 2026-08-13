"""Unit tests for app/core/evolution/commit_analyzer.py (Task 25).

Pure aggregation/classification logic, no I/O -- no fakes/mocks needed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.domain.enums import CommitCategory
from app.domain.models import CommitInfo

_NOW = datetime(2026, 8, 10, tzinfo=UTC)


def _commit(
    sha: str = "sha1",
    message: str = "chore: misc",
    files: list[str] | None = None,
    author_name: str | None = "Alice",
    author_email: str | None = "alice@example.com",
    committed_at: datetime | None = _NOW,
) -> CommitInfo:
    return CommitInfo(
        commit_sha=sha,
        message=message,
        files_changed=files if files is not None else ["src/app.py"],
        author_name=author_name,
        author_email=author_email,
        committed_at=committed_at,
    )


def test_empty_commit_list_returns_a_zeroed_result() -> None:
    result = CommitAnalyzer().analyze_commits([], reference_time=_NOW)

    assert result.total_commits == 0
    assert result.file_modification_counts == {}
    assert result.author_contributions == []
    assert all(count == 0 for count in result.commit_type_counts.values())


def test_total_commits_matches_input_length() -> None:
    commits = [_commit("a"), _commit("b"), _commit("c")]

    result = CommitAnalyzer().analyze_commits(commits, reference_time=_NOW)

    assert result.total_commits == 3


def test_file_modification_counts_are_aggregated_across_commits() -> None:
    commits = [
        _commit("a", files=["src/auth.py"]),
        _commit("b", files=["src/auth.py", "src/app.py"]),
    ]

    result = CommitAnalyzer().analyze_commits(commits, reference_time=_NOW)

    assert result.file_modification_counts == {"src/auth.py": 2, "src/app.py": 1}


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("feat: add login", CommitCategory.FEAT),
        ("fix: null pointer", CommitCategory.FIX),
        ("refactor: extract helper", CommitCategory.REFACTOR),
        ("chore: bump deps", CommitCategory.CHORE),
        ("docs: update README", CommitCategory.DOCS),
        ("style: reformat", CommitCategory.STYLE),
        ("test: add coverage", CommitCategory.TEST),
        ("perf: speed up query", CommitCategory.PERF),
        ("build: update pipeline", CommitCategory.BUILD),
        ("ci: fix workflow", CommitCategory.CI),
        ("revert: undo change", CommitCategory.REVERT),
    ],
)
def test_conventional_commit_types_are_classified_correctly(
    message: str, expected: CommitCategory
) -> None:
    result = CommitAnalyzer().analyze_commits([_commit(message=message)], reference_time=_NOW)

    assert result.commit_type_counts[expected] == 1


def test_scoped_conventional_commit_is_classified() -> None:
    result = CommitAnalyzer().analyze_commits(
        [_commit(message="feat(auth): add login")], reference_time=_NOW
    )

    assert result.commit_type_counts[CommitCategory.FEAT] == 1


def test_breaking_change_marker_is_still_classified() -> None:
    result = CommitAnalyzer().analyze_commits(
        [_commit(message="fix!: breaking change")], reference_time=_NOW
    )

    assert result.commit_type_counts[CommitCategory.FIX] == 1


def test_unrecognized_prefix_classifies_as_other() -> None:
    result = CommitAnalyzer().analyze_commits(
        [_commit(message="wip: half-finished thing")], reference_time=_NOW
    )

    assert result.commit_type_counts[CommitCategory.OTHER] == 1


def test_message_with_no_conventional_prefix_classifies_as_other() -> None:
    result = CommitAnalyzer().analyze_commits(
        [_commit(message="fixed the login bug")], reference_time=_NOW
    )

    assert result.commit_type_counts[CommitCategory.OTHER] == 1


def test_commit_type_counts_include_every_category_even_at_zero() -> None:
    result = CommitAnalyzer().analyze_commits([_commit(message="feat: x")], reference_time=_NOW)

    assert set(result.commit_type_counts) == set(CommitCategory)
    assert result.commit_type_counts[CommitCategory.FIX] == 0


def test_missing_author_email_falls_back_to_author_name() -> None:
    commit = _commit(author_name="Bob", author_email=None)

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    assert [c.author for c in result.author_contributions] == ["Bob"]


def test_missing_author_name_and_email_falls_back_to_unknown() -> None:
    commit = _commit(author_name=None, author_email=None)

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    assert [c.author for c in result.author_contributions] == ["unknown"]


def test_author_contributions_are_sorted_descending_by_commit_count() -> None:
    commits = [
        _commit("a", author_email="alice@x.com"),
        _commit("b", author_email="bob@x.com"),
        _commit("c", author_email="alice@x.com"),
        _commit("d", author_email="alice@x.com"),
    ]

    result = CommitAnalyzer().analyze_commits(commits, reference_time=_NOW)

    assert [c.author for c in result.author_contributions] == ["alice@x.com", "bob@x.com"]
    assert result.author_contributions[0].commit_count == 3
    assert result.author_contributions[1].commit_count == 1


def test_commit_within_30_days_counts_in_all_three_windows() -> None:
    commit = _commit(files=["src/app.py"], committed_at=_NOW - timedelta(days=5))

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    windows = result.file_modification_windows["src/app.py"]
    assert windows.last_30_days == 1
    assert windows.last_90_days == 1
    assert windows.last_180_days == 1


def test_commit_between_30_and_90_days_counts_only_in_90_and_180() -> None:
    commit = _commit(files=["src/app.py"], committed_at=_NOW - timedelta(days=60))

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    windows = result.file_modification_windows["src/app.py"]
    assert windows.last_30_days == 0
    assert windows.last_90_days == 1
    assert windows.last_180_days == 1


def test_commit_older_than_180_days_counts_in_no_window() -> None:
    commit = _commit(files=["src/app.py"], committed_at=_NOW - timedelta(days=200))

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    windows = result.file_modification_windows["src/app.py"]
    assert windows.last_30_days == 0
    assert windows.last_90_days == 0
    assert windows.last_180_days == 0


def test_commit_with_no_timestamp_still_counts_toward_file_totals() -> None:
    commit = _commit(files=["src/app.py"], committed_at=None)

    result = CommitAnalyzer().analyze_commits([commit], reference_time=_NOW)

    assert result.file_modification_counts["src/app.py"] == 1
    windows = result.file_modification_windows["src/app.py"]
    assert windows.last_30_days == 0
    assert windows.last_90_days == 0
    assert windows.last_180_days == 0


def test_reference_time_is_echoed_back_verbatim_when_provided() -> None:
    result = CommitAnalyzer().analyze_commits([], reference_time=_NOW)

    assert result.reference_time == _NOW


def test_reference_time_defaults_to_real_now_when_not_provided() -> None:
    before = datetime.now(UTC)
    result = CommitAnalyzer().analyze_commits([])
    after = datetime.now(UTC)

    assert before <= result.reference_time <= after
