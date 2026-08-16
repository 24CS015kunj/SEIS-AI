"""Code Churn & Hotspot Calculator.

Task 26 (Phase 5, follows Task 25): combines Task 25's per-file commit
counts with each file's line count into a deterministic, rankable
``HotspotScore`` -- files that are both frequently modified *and* large
are architecturally riskier than either signal alone suggests (§7.2
Problem Statement).

Formula reconciliation: the frozen stub's own docstring (Task 1) and
this task's Architecture Reasoning both speak generally of "complexity",
but subtask 3's actual formula is explicit and literal: ``HotspotScore =
CommitCount x LineCount``. No complexity-analysis dependency is listed
in this task's own ``Dependencies`` (``app.domain`` only) -- line count
(``len(content.splitlines())``) is the complexity proxy this task
actually asks for, not a cyclomatic-complexity engine. Using line count
instead of raw commit count alone is precisely the Common Mistakes
warning this task calls out: "treating raw commit count as hotspot risk
without factoring file size/complexity."

``HotspotMetrics`` is a genuine domain-model gap fill (module docstring
of ``app.domain.models``, same reconciliation already applied to
``CommitAnalysisResult``); ``Document`` (Task 13) is reused as-is for
line-count input rather than inventing a duplicate "File" shape.

Candidate scope: only files that both (a) appear in
``commit_analysis.file_modification_counts`` (were actually modified at
least once in the analyzed commit set) and (b) have a matching
``Document`` in ``files`` (so a line count is actually available) are
scored. A file with zero recorded commits cannot be a "hotspot" by this
task's own formula (its score would be zero regardless), and a file
with commits but no supplied ``Document`` (e.g. deleted since, or
excluded from indexing like a lockfile/binary asset) cannot be scored
without content to measure -- it is skipped rather than guessed at.

Normalization (Best Practices: "normalize hotspot scores to [0.0, 100.0]
... for UI reporting"): each file's raw score is expressed as a
percentage of the single highest raw score among the candidates being
ranked -- the riskiest file in this set always scores exactly 100,
every other file scores proportionally beneath it. This reads more
naturally for UI reporting (a risk gauge, a heatmap width) than a
min-max scale that would otherwise force the *least* risky candidate
toward 0 regardless of its real absolute risk.

Top-N reconciliation: subtask 4 asks for "top 10", but the frozen
signature (``calculate_hotspots(commit_analysis, files) ->
list[HotspotMetrics]``) takes no count parameter. The same "additional
optional keyword-only parameter beyond the frozen signature" pattern
Task 25 already used for ``reference_time`` applies here: ``top_n``
defaults to 10 (subtask 4's own number) but is overridable, primarily
so tests aren't forced to fabricate eleven-plus files to exercise the
truncation behavior itself.
"""

from __future__ import annotations

import structlog

from app.domain.models import CommitAnalysisResult, Document, HotspotMetrics

logger = structlog.get_logger("seis.core.evolution")

_DEFAULT_TOP_N = 10


def _count_lines(content: str) -> int:
    if not content:
        return 0
    return len(content.splitlines())


def _normalize(raw_score: float, max_raw_score: float) -> float:
    if max_raw_score <= 0:
        return 0.0
    return (raw_score / max_raw_score) * 100.0


class ChurnCalculator:
    """Ranks files by churn-weighted-by-size risk (Task 26, §7.2)."""

    def __init__(self) -> None:
        self._log = logger.bind(component="churn_calculator")

    def calculate_hotspots(
        self,
        commit_analysis: CommitAnalysisResult,
        files: list[Document],
        *,
        top_n: int = _DEFAULT_TOP_N,
    ) -> list[HotspotMetrics]:
        """Scores every file with both a recorded commit count and
        available content, normalizes scores to ``[0, 100]`` relative to
        the highest-risk candidate, and returns the top ``top_n``
        (default 10) sorted descending.
        """
        documents_by_path = {document.file_path: document for document in files}

        candidates: dict[str, tuple[int, int, float]] = {}
        for file_path, commit_count in commit_analysis.file_modification_counts.items():
            document = documents_by_path.get(file_path)
            if document is None:
                continue
            line_count = _count_lines(document.content)
            raw_score = float(commit_count * line_count)
            candidates[file_path] = (commit_count, line_count, raw_score)

        if not candidates:
            self._log.info("hotspots_calculated", candidate_count=0, returned_count=0)
            return []

        max_raw_score = max(raw_score for _, _, raw_score in candidates.values())

        hotspots = [
            HotspotMetrics(
                file_path=file_path,
                commit_count=commit_count,
                line_count=line_count,
                hotspot_score=_normalize(raw_score, max_raw_score),
            )
            for file_path, (commit_count, line_count, raw_score) in candidates.items()
        ]
        hotspots.sort(key=lambda hotspot: hotspot.hotspot_score, reverse=True)

        top = hotspots[:top_n]
        self._log.info(
            "hotspots_calculated", candidate_count=len(hotspots), returned_count=len(top)
        )
        return top
