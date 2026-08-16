"""Unit tests for app/core/intelligence/insights_generator.py (Task 28).

Pure rule-evaluation logic, no I/O -- no fakes/mocks needed.
"""

from __future__ import annotations

from app.core.intelligence.insights_generator import InsightsGenerator
from app.domain.enums import InsightCategory, InsightSeverity
from app.domain.models import HotspotMetrics, ModuleTrend, StructuralTrends


def _hotspot(
    file_path: str = "src/app.py",
    commit_count: int = 5,
    line_count: int = 50,
    score: float = 50.0,
) -> HotspotMetrics:
    return HotspotMetrics(
        file_path=file_path, commit_count=commit_count, line_count=line_count, hotspot_score=score
    )


def _module_trend(module: str = "app/core", share: float = 0.6, high: bool = True) -> ModuleTrend:
    return ModuleTrend(
        module=module, file_count=3, commit_count=10, churn_share=share, is_high_churn=high
    )


def _trends(*module_trends: ModuleTrend) -> StructuralTrends:
    return StructuralTrends(
        module_trends=list(module_trends),
        high_churn_modules=[t.module for t in module_trends if t.is_high_churn],
    )


def test_empty_hotspots_and_trends_returns_empty_list() -> None:
    result = InsightsGenerator().generate_insights([], _trends())

    assert result == []


def test_no_high_risk_insight_below_the_minor_threshold() -> None:
    hotspots = [_hotspot(score=49.9)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    assert not any(i.category == InsightCategory.HIGH_RISK_MODULE for i in result)


def test_high_risk_module_is_minor_between_50_and_75() -> None:
    hotspots = [_hotspot(score=60.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.HIGH_RISK_MODULE)
    assert insight.severity == InsightSeverity.MINOR


def test_high_risk_module_is_major_between_75_and_90() -> None:
    hotspots = [_hotspot(score=80.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.HIGH_RISK_MODULE)
    assert insight.severity == InsightSeverity.MAJOR


def test_high_risk_module_is_critical_at_or_above_90() -> None:
    hotspots = [_hotspot(score=95.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.HIGH_RISK_MODULE)
    assert insight.severity == InsightSeverity.CRITICAL


def test_high_risk_module_subject_is_the_file_path() -> None:
    hotspots = [_hotspot(file_path="src/auth.py", score=95.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.HIGH_RISK_MODULE)
    assert insight.subject == "src/auth.py"


def test_refactoring_not_triggered_for_a_small_file_even_with_a_high_score() -> None:
    hotspots = [_hotspot(line_count=50, score=95.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    assert not any(i.category == InsightCategory.REFACTORING_RECOMMENDED for i in result)


def test_refactoring_recommended_is_minor_for_a_large_file_alone() -> None:
    hotspots = [_hotspot(line_count=350, commit_count=1, score=10.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.REFACTORING_RECOMMENDED)
    assert insight.severity == InsightSeverity.MINOR


def test_refactoring_recommended_is_major_for_large_plus_moderate_score() -> None:
    hotspots = [_hotspot(line_count=450, score=55.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.REFACTORING_RECOMMENDED)
    assert insight.severity == InsightSeverity.MAJOR


def test_refactoring_recommended_is_critical_for_very_large_plus_high_score() -> None:
    hotspots = [_hotspot(line_count=650, score=80.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    insight = next(i for i in result if i.category == InsightCategory.REFACTORING_RECOMMENDED)
    assert insight.severity == InsightSeverity.CRITICAL


def test_bus_factor_warning_only_generated_for_high_churn_modules() -> None:
    trends = _trends(_module_trend(module="app/core", share=0.4, high=False))

    result = InsightsGenerator().generate_insights([], trends)

    assert not any(i.category == InsightCategory.BUS_FACTOR_WARNING for i in result)


def test_bus_factor_warning_is_minor_just_above_50_percent() -> None:
    trends = _trends(_module_trend(share=0.55, high=True))

    result = InsightsGenerator().generate_insights([], trends)

    insight = next(i for i in result if i.category == InsightCategory.BUS_FACTOR_WARNING)
    assert insight.severity == InsightSeverity.MINOR


def test_bus_factor_warning_is_major_between_65_and_85_percent() -> None:
    trends = _trends(_module_trend(share=0.70, high=True))

    result = InsightsGenerator().generate_insights([], trends)

    insight = next(i for i in result if i.category == InsightCategory.BUS_FACTOR_WARNING)
    assert insight.severity == InsightSeverity.MAJOR


def test_bus_factor_warning_is_critical_at_or_above_85_percent() -> None:
    trends = _trends(_module_trend(share=0.90, high=True))

    result = InsightsGenerator().generate_insights([], trends)

    insight = next(i for i in result if i.category == InsightCategory.BUS_FACTOR_WARNING)
    assert insight.severity == InsightSeverity.CRITICAL


def test_bus_factor_warning_subject_is_the_module_name() -> None:
    trends = _trends(_module_trend(module="app/infra", share=0.9, high=True))

    result = InsightsGenerator().generate_insights([], trends)

    insight = next(i for i in result if i.category == InsightCategory.BUS_FACTOR_WARNING)
    assert insight.subject == "app/infra"


def test_a_single_hotspot_can_produce_both_high_risk_and_refactoring_insights() -> None:
    hotspots = [_hotspot(line_count=650, commit_count=20, score=95.0)]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    categories = {i.category for i in result}
    assert InsightCategory.HIGH_RISK_MODULE in categories
    assert InsightCategory.REFACTORING_RECOMMENDED in categories


def test_insights_are_sorted_with_critical_first() -> None:
    hotspots = [
        _hotspot(file_path="minor.py", score=55.0),
        _hotspot(file_path="critical.py", score=95.0),
    ]

    result = InsightsGenerator().generate_insights(hotspots, _trends())

    assert result[0].severity == InsightSeverity.CRITICAL
    assert result[-1].severity == InsightSeverity.MINOR


def test_every_generated_insight_has_a_non_empty_recommendation() -> None:
    hotspots = [_hotspot(line_count=650, commit_count=20, score=95.0)]
    trends = _trends(_module_trend(share=0.9, high=True))

    result = InsightsGenerator().generate_insights(hotspots, trends)

    assert len(result) > 0
    for insight in result:
        assert insight.recommendation.strip() != ""
        assert insight.summary.strip() != ""
