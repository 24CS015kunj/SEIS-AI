"""Unit tests for app/core/intelligence/trend_detector.py (Task 27).

Pure grouping/aggregation logic, no I/O -- no fakes/mocks needed.
"""

from __future__ import annotations

from app.core.intelligence.trend_detector import TrendDetector
from app.domain.models import HotspotMetrics


def _hotspot(file_path: str, commit_count: int, score: float = 50.0) -> HotspotMetrics:
    return HotspotMetrics(
        file_path=file_path, commit_count=commit_count, line_count=10, hotspot_score=score
    )


def test_empty_hotspots_list_returns_empty_trends() -> None:
    result = TrendDetector().detect_trends([])

    assert result.module_trends == []
    assert result.high_churn_modules == []


def test_files_are_grouped_by_first_two_path_segments() -> None:
    hotspots = [_hotspot("app/core/evolution/churn_calculator.py", 5)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends[0].module == "app/core"


def test_deep_subpaths_under_the_same_module_collapse_together() -> None:
    """Common Mistakes: "grouping files by deep subpaths rather than
    logical module boundaries" -- two files several directories apart
    but under the same top-level module must merge into one entry."""
    hotspots = [
        _hotspot("app/core/evolution/churn_calculator.py", 5),
        _hotspot("app/core/retrieval/rag_optimizer.py", 3),
    ]

    result = TrendDetector().detect_trends(hotspots)

    assert len(result.module_trends) == 1
    assert result.module_trends[0].module == "app/core"
    assert result.module_trends[0].file_count == 2
    assert result.module_trends[0].commit_count == 8


def test_single_directory_level_path_groups_by_that_segment() -> None:
    hotspots = [_hotspot("docs/README.md", 2)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends[0].module == "docs"


def test_root_level_file_groups_under_the_root_sentinel() -> None:
    hotspots = [_hotspot("README.md", 1)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends[0].module == "(root)"


def test_node_modules_directory_is_excluded() -> None:
    hotspots = [_hotspot("frontend/node_modules/pkg/index.js", 100)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends == []


def test_venv_directory_is_excluded() -> None:
    hotspots = [_hotspot(".venv/lib/site-packages/pkg.py", 100)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends == []


def test_pycache_directory_is_excluded() -> None:
    hotspots = [_hotspot("app/core/__pycache__/module.pyc", 100)]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends == []


def test_excluded_files_do_not_count_toward_other_modules_totals() -> None:
    hotspots = [
        _hotspot("app/core/evolution/churn_calculator.py", 5),
        _hotspot("node_modules/pkg/index.js", 999),
    ]

    result = TrendDetector().detect_trends(hotspots)

    assert len(result.module_trends) == 1
    assert result.module_trends[0].commit_count == 5


def test_module_with_more_than_50_percent_churn_is_flagged_high_churn() -> None:
    hotspots = [
        _hotspot("app/core/a.py", 8),
        _hotspot("app/infra/b.py", 2),
    ]

    result = TrendDetector().detect_trends(hotspots)

    core_trend = next(t for t in result.module_trends if t.module == "app/core")
    assert core_trend.churn_share == 0.8
    assert core_trend.is_high_churn is True


def test_module_at_exactly_50_percent_is_not_flagged_high_churn() -> None:
    hotspots = [
        _hotspot("app/core/a.py", 5),
        _hotspot("app/infra/b.py", 5),
    ]

    result = TrendDetector().detect_trends(hotspots)

    assert all(trend.is_high_churn is False for trend in result.module_trends)
    assert result.high_churn_modules == []


def test_high_churn_modules_list_matches_flagged_module_trends() -> None:
    hotspots = [
        _hotspot("app/core/a.py", 9),
        _hotspot("app/infra/b.py", 1),
    ]

    result = TrendDetector().detect_trends(hotspots)

    flagged = [t.module for t in result.module_trends if t.is_high_churn]
    assert result.high_churn_modules == flagged
    assert result.high_churn_modules == ["app/core"]


def test_module_trends_are_sorted_descending_by_churn_share() -> None:
    hotspots = [
        _hotspot("app/api/a.py", 1),
        _hotspot("app/core/b.py", 6),
        _hotspot("app/infra/c.py", 3),
    ]

    result = TrendDetector().detect_trends(hotspots)

    assert [t.module for t in result.module_trends] == ["app/core", "app/infra", "app/api"]


def test_file_count_is_the_number_of_hotspot_files_in_the_module() -> None:
    hotspots = [
        _hotspot("app/core/a.py", 1),
        _hotspot("app/core/b.py", 1),
        _hotspot("app/core/c.py", 1),
    ]

    result = TrendDetector().detect_trends(hotspots)

    assert result.module_trends[0].file_count == 3
