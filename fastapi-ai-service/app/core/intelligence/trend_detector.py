"""Structural Trend & Architecture Intelligence Engine.

Task 27 (Phase 5, follows Task 26): groups Task 26's ranked hotspot
files by top-level module directory and flags modules dominating churn,
so architectural drift shows up as data instead of staying implicit in
a flat file list (§7.3 Problem Statement: "architectural boundaries
drift silently as dependencies expand").

File-tree note: a *different*, still-empty stub also exists at
``app/core/evolution/trend_detector.py`` (an orphaned Task 1 scaffold
file not named by any task in the frozen roadmap's file list). This
task's own ``Files`` entry is ``app/core/intelligence/trend_detector.py``
-- implemented here, in the correct location; the sibling stub is left
untouched, same as Task 22 left the unused
``app/core/generation/context_builder.py`` stub alone.

Domain model reconciliation: ``StructuralTrends`` (plus the new
``ModuleTrend``) is named in this task's own signature but never
existed before -- the same "genuine gap, not invented" pattern already
applied to ``HotspotMetrics`` (Task 26) and its predecessors.

Module-grouping algorithm (subtask 3, Common Mistakes: "grouping files
by deep subpaths rather than logical module boundaries"): a file's
module is its first *two* path segments joined (e.g.
``app/core/evolution/churn_calculator.py`` -> ``app/core``), matching
this task's own worked examples (``app/core``, ``app/infra``) exactly
-- not the first segment alone (too coarse; every file under ``app/``
would collapse into one bucket) and not the full directory path (too
deep; exactly what Common Mistakes warns against). A path with only one
directory level (e.g. ``docs/README.md``) groups by that single
segment; a path with no directory at all (a repository-root file)
groups under the fixed sentinel ``"(root)"``.

Vendored/generated exclusion (Best Practices: "exclude auto-generated
or vendored code directories from trend calculations"): any file whose
path contains a segment matching a small fixed set of well-known
non-source directory names (``node_modules``, ``.venv``, ``venv``,
``__pycache__``, ``.git``, ``dist``, ``build``, ``vendor``,
``site-packages``) is dropped entirely before grouping -- it
contributes to no module's churn count.

Churn share (subtask 4): computed from the *hotspots actually passed
in* (this task's only input, per its own frozen signature -- it has no
access to a repository's full commit history, only Task 26's already-
ranked candidate list), as each module's share of the summed
``commit_count`` across all included hotspots. A module is flagged
high-churn when its share strictly exceeds 50% (subtask 4's own
threshold), not at-or-above -- an exact half-and-half split between two
modules flags neither as dominant.
"""

from __future__ import annotations

import structlog

from app.domain.models import HotspotMetrics, ModuleTrend, StructuralTrends

logger = structlog.get_logger("seis.core.intelligence")

_ROOT_MODULE = "(root)"
_HIGH_CHURN_THRESHOLD = 0.5

_EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        "node_modules",
        ".venv",
        "venv",
        "__pycache__",
        ".git",
        "dist",
        "build",
        "vendor",
        "site-packages",
    }
)


def _module_of(file_path: str) -> str | None:
    """Returns the top-level module directory for ``file_path``, or
    ``None`` if the path falls inside an excluded (vendored/generated)
    directory and should be dropped entirely."""
    parts = [part for part in file_path.split("/") if part]
    if not parts:
        return None
    if any(part.lower() in _EXCLUDED_DIRECTORY_NAMES for part in parts[:-1]):
        return None
    if len(parts) >= 3:
        return f"{parts[0]}/{parts[1]}"
    if len(parts) == 2:
        return parts[0]
    return _ROOT_MODULE


class TrendDetector:
    """Groups hotspot churn by module directory and flags dominant
    modules (Task 27, §7.3)."""

    def __init__(self) -> None:
        self._log = logger.bind(component="trend_detector")

    def detect_trends(self, hotspots: list[HotspotMetrics]) -> StructuralTrends:
        module_commit_counts: dict[str, int] = {}
        module_file_counts: dict[str, int] = {}

        for hotspot in hotspots:
            module = _module_of(hotspot.file_path)
            if module is None:
                continue
            module_commit_counts[module] = (
                module_commit_counts.get(module, 0) + hotspot.commit_count
            )
            module_file_counts[module] = module_file_counts.get(module, 0) + 1

        total_commits = sum(module_commit_counts.values())

        module_trends = [
            ModuleTrend(
                module=module,
                file_count=module_file_counts[module],
                commit_count=commit_count,
                churn_share=_share(commit_count, total_commits),
                is_high_churn=_share(commit_count, total_commits) > _HIGH_CHURN_THRESHOLD,
            )
            for module, commit_count in module_commit_counts.items()
        ]
        module_trends.sort(key=lambda trend: trend.churn_share, reverse=True)

        high_churn_modules = [trend.module for trend in module_trends if trend.is_high_churn]

        self._log.info(
            "trends_detected",
            module_count=len(module_trends),
            high_churn_count=len(high_churn_modules),
        )
        return StructuralTrends(module_trends=module_trends, high_churn_modules=high_churn_modules)


def _share(count: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return count / total
