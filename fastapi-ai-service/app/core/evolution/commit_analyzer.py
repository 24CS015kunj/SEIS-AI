"""Software Evolution Commit & History Analyzer.

Task 25 (Phase 5, first task): parses a repository's raw commit history
into structured, queryable statistics -- per-file modification counts
(overall and windowed), author contribution rankings, and Conventional
Commits message classification (§7.1). The first stage of the Evolution
pipeline; its output (:class:`CommitAnalysisResult`) is Task 26's
``ChurnCalculator.calculate_hotspots``'s first argument.

Domain model reconciliation: ``CommitInfo`` and ``CommitAnalysisResult``
are named in this task's own signature (``analyze_commits(commits:
list[CommitInfo]) -> CommitAnalysisResult``) but neither existed before
this task -- the same "genuine gap, not invented" pattern already
applied to :class:`app.domain.models.ContextBlock` (Task 21) and its
predecessors. Both now live in ``app.domain.models``.

Reference-time reconciliation: subtask 3 asks for frequency aggregation
"over specified time windows (30/90/180 days)" but names no clock
source, and this task's own ``Dependencies`` list only ``app.domain`` --
no settings/clock injection point. ``analyze_commits`` accepts an
*additional*, optional, keyword-only ``reference_time`` beyond the
frozen positional signature (defaulting to real wall-clock "now" via
``datetime.now(UTC)``) rather than reading a hidden global clock: real
callers get real "commits in the last N days" semantics, while tests
get a fully deterministic, reproducible reference point without
monkeypatching time itself.

Missing-field handling (Common Mistakes: "failing to handle missing
author email or timestamp fields"): a commit with no ``author_email``
falls back to ``author_name``, then to a fixed "unknown" placeholder --
author aggregation is never skipped or crashed on. A commit with no
``committed_at`` still counts toward ``file_modification_counts`` and
``commit_type_counts``; it simply cannot contribute to any of the three
time-windowed counts (there is no time to bucket it by).

Classification (Best Practices: "use regex patterns to categorize
standard Conventional Commit prefixes"): a single regex extracts the
leading ``type(scope)!: `` token; anything that doesn't match, or whose
type isn't one of the standard Conventional Commits types, classifies
as :class:`~app.domain.enums.CommitCategory.OTHER` -- never a parse
failure.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import structlog

from app.domain.enums import CommitCategory
from app.domain.models import (
    AuthorContribution,
    CommitAnalysisResult,
    CommitInfo,
    FileChangeWindowCounts,
)

logger = structlog.get_logger("seis.core.evolution")

_UNKNOWN_AUTHOR = "unknown"

_WINDOW_30 = timedelta(days=30)
_WINDOW_90 = timedelta(days=90)
_WINDOW_180 = timedelta(days=180)

# Matches a leading Conventional Commits header: `type(scope)!: subject` or
# just `type: subject` -- scope and the breaking-change `!` are optional.
_CONVENTIONAL_COMMIT_PATTERN = re.compile(r"^(?P<type>[a-zA-Z]+)(?:\([^)]*\))?!?:\s")

_COMMIT_TYPE_MAP: dict[str, CommitCategory] = {
    "feat": CommitCategory.FEAT,
    "fix": CommitCategory.FIX,
    "refactor": CommitCategory.REFACTOR,
    "chore": CommitCategory.CHORE,
    "docs": CommitCategory.DOCS,
    "style": CommitCategory.STYLE,
    "test": CommitCategory.TEST,
    "perf": CommitCategory.PERF,
    "build": CommitCategory.BUILD,
    "ci": CommitCategory.CI,
    "revert": CommitCategory.REVERT,
}


def _classify_message(message: str) -> CommitCategory:
    match = _CONVENTIONAL_COMMIT_PATTERN.match(message.strip())
    if match is None:
        return CommitCategory.OTHER
    return _COMMIT_TYPE_MAP.get(match.group("type").lower(), CommitCategory.OTHER)


def _author_identity(commit: CommitInfo) -> str:
    return commit.author_email or commit.author_name or _UNKNOWN_AUTHOR


class CommitAnalyzer:
    """Parses raw commit history into structured statistics (Task 25, §7.1)."""

    def __init__(self) -> None:
        self._log = logger.bind(component="commit_analyzer")

    def analyze_commits(
        self,
        commits: list[CommitInfo],
        *,
        reference_time: datetime | None = None,
    ) -> CommitAnalysisResult:
        """Aggregates ``commits`` into file modification counts (overall
        and windowed), author contribution rankings, and Conventional
        Commits classification counts.

        ``reference_time`` defaults to ``datetime.now(UTC)`` -- pass an
        explicit value for deterministic, reproducible window counts
        (e.g. in tests, or when reprocessing historical data as-of a
        fixed point).
        """
        now = reference_time if reference_time is not None else datetime.now(UTC)

        file_totals: dict[str, int] = {}
        file_windows: dict[str, dict[str, int]] = {}
        author_counts: dict[str, int] = {}
        type_counts: dict[CommitCategory, int] = dict.fromkeys(CommitCategory, 0)

        for commit in commits:
            type_counts[_classify_message(commit.message)] += 1

            author = _author_identity(commit)
            author_counts[author] = author_counts.get(author, 0) + 1

            within_30 = within_90 = within_180 = False
            if commit.committed_at is not None:
                age = now - commit.committed_at
                within_30 = age <= _WINDOW_30
                within_90 = age <= _WINDOW_90
                within_180 = age <= _WINDOW_180

            for file_path in commit.files_changed:
                file_totals[file_path] = file_totals.get(file_path, 0) + 1
                windows = file_windows.setdefault(
                    file_path, {"last_30_days": 0, "last_90_days": 0, "last_180_days": 0}
                )
                if within_30:
                    windows["last_30_days"] += 1
                if within_90:
                    windows["last_90_days"] += 1
                if within_180:
                    windows["last_180_days"] += 1

        file_modification_windows = {
            path: FileChangeWindowCounts(**counts) for path, counts in file_windows.items()
        }
        author_contributions = sorted(
            (
                AuthorContribution(author=author, commit_count=count)
                for author, count in author_counts.items()
            ),
            key=lambda contribution: contribution.commit_count,
            reverse=True,
        )

        self._log.info(
            "commits_analyzed",
            total_commits=len(commits),
            unique_files=len(file_totals),
            unique_authors=len(author_counts),
        )
        return CommitAnalysisResult(
            total_commits=len(commits),
            file_modification_counts=file_totals,
            file_modification_windows=file_modification_windows,
            author_contributions=author_contributions,
            commit_type_counts=type_counts,
            reference_time=now,
        )
