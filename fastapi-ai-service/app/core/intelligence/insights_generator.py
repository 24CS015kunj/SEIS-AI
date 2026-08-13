"""Engineering Insights Generator.

Task 28 (Phase 5, follows Task 27): synthesizes Task 26's ranked
hotspots and Task 27's structural trends into categorized, severity-
rated, actionable recommendations -- raw metrics numbers are hard for a
technical lead to turn into an immediate decision; a labeled warning
with a concrete remediation is not (§7.4 Architecture Reasoning).

``EngineeringInsight`` is a genuine domain-model gap fill (module
docstring of ``app.domain.models``), reusing the frozen ``HotspotMetrics``
(Task 26) and ``StructuralTrends``/``ModuleTrend`` (Task 27) as-is for
input rather than inventing parallel shapes.

Bus-factor reconciliation: this task's own Architecture Reasoning
example ("`auth.py` has high churn and single-author ownership")
implies per-file author attribution, but this task's frozen signature
(``generate_insights(hotspots: list[HotspotMetrics], trends:
StructuralTrends) -> list[EngineeringInsight]``) carries no author data
at all -- neither ``HotspotMetrics`` nor ``StructuralTrends`` tracks
who committed what, and Task 25's ``CommitAnalysisResult.author_
contributions`` is a *repository-wide* total, not broken down per file
or module. Adding real per-file authorship would mean re-scoping Task
25's domain model, well beyond what this task asks for. Given only what
this task's own inputs actually carry, ``BUS_FACTOR_WARNING`` here is a
documented proxy: a *module* absorbing a disproportionate share of all
recorded churn (Task 27's own ``is_high_churn``, >50%) is flagged,
because concentrated change activity in one narrow architectural area
is a genuine, observable precursor to key-person risk even without
literal git-blame data -- not a claim that any specific person is the
sole owner.

Severity bands are deliberately grounded in signals this task's inputs
already compute, not fresh unrelated numbers, wherever possible:
``HotspotMetrics.hotspot_score`` (already normalized 0-100 relative to
the riskiest file in the analyzed set, Task 26) drives HIGH_RISK_MODULE
directly, and ``ModuleTrend.churn_share`` drives BUS_FACTOR_WARNING
directly. REFACTORING_RECOMMENDED is the one category that genuinely
needs an absolute size signal no relative score can substitute for --
"should this specific file be split up" doesn't become less true just
because every other file in a given analysis happens to be even
larger -- so it additionally uses fixed line-count bands loosely
modeled on common style-guide/linter "this file is getting large"
defaults (e.g. ESLint's default ``max-lines`` is 300).

Actionability (Best Practices: "include concise remediation
recommendations alongside every warning"; Common Mistakes: "generating
vague, unactionable warnings"): every :class:`EngineeringInsight` this
module produces carries a fixed, concrete ``recommendation`` string for
its category -- never only a restated metric.

Output ordering: sorted by severity (CRITICAL, then MAJOR, then MINOR);
ties preserve the order insights were generated in (hotspot-derived
insights follow ``hotspots``' own rank order, since Task 26 already
sorts its output descending by score).
"""

from __future__ import annotations

import structlog

from app.domain.enums import InsightCategory, InsightSeverity
from app.domain.models import EngineeringInsight, HotspotMetrics, ModuleTrend, StructuralTrends

logger = structlog.get_logger("seis.core.intelligence")

_HIGH_RISK_CRITICAL_SCORE = 90.0
_HIGH_RISK_MAJOR_SCORE = 75.0
_HIGH_RISK_MINOR_SCORE = 50.0

_REFACTOR_CRITICAL_LINES = 600
_REFACTOR_CRITICAL_SCORE = 75.0
_REFACTOR_MAJOR_LINES = 400
_REFACTOR_MAJOR_SCORE = 50.0
_REFACTOR_MINOR_LINES = 300

_BUS_FACTOR_CRITICAL_SHARE = 0.85
_BUS_FACTOR_MAJOR_SHARE = 0.65

_SEVERITY_ORDER = {
    InsightSeverity.CRITICAL: 0,
    InsightSeverity.MAJOR: 1,
    InsightSeverity.MINOR: 2,
}


def _high_risk_module_insight(hotspot: HotspotMetrics) -> EngineeringInsight | None:
    severity = _severity_for_score(hotspot.hotspot_score)
    if severity is None:
        return None
    return EngineeringInsight(
        category=InsightCategory.HIGH_RISK_MODULE,
        severity=severity,
        subject=hotspot.file_path,
        summary=(
            f"'{hotspot.file_path}' is a top hotspot in this analysis "
            f"(churn-weighted risk score {hotspot.hotspot_score:.0f}/100)."
        ),
        recommendation=(
            "Prioritize additional test coverage and code review scrutiny "
            "here before further changes land."
        ),
    )


def _severity_for_score(score: float) -> InsightSeverity | None:
    if score >= _HIGH_RISK_CRITICAL_SCORE:
        return InsightSeverity.CRITICAL
    if score >= _HIGH_RISK_MAJOR_SCORE:
        return InsightSeverity.MAJOR
    if score >= _HIGH_RISK_MINOR_SCORE:
        return InsightSeverity.MINOR
    return None


def _refactoring_insight(hotspot: HotspotMetrics) -> EngineeringInsight | None:
    severity = _severity_for_refactoring(hotspot.line_count, hotspot.hotspot_score)
    if severity is None:
        return None
    return EngineeringInsight(
        category=InsightCategory.REFACTORING_RECOMMENDED,
        severity=severity,
        subject=hotspot.file_path,
        summary=(
            f"'{hotspot.file_path}' is both large ({hotspot.line_count} lines) "
            f"and frequently modified ({hotspot.commit_count} commits)."
        ),
        recommendation=(
            "Consider decomposing this file into smaller, single-responsibility "
            "modules to reduce the blast radius of future changes."
        ),
    )


def _severity_for_refactoring(line_count: int, score: float) -> InsightSeverity | None:
    if line_count >= _REFACTOR_CRITICAL_LINES and score >= _REFACTOR_CRITICAL_SCORE:
        return InsightSeverity.CRITICAL
    if line_count >= _REFACTOR_MAJOR_LINES and score >= _REFACTOR_MAJOR_SCORE:
        return InsightSeverity.MAJOR
    if line_count >= _REFACTOR_MINOR_LINES:
        return InsightSeverity.MINOR
    return None


def _bus_factor_insight(module_trend: ModuleTrend) -> EngineeringInsight:
    return EngineeringInsight(
        category=InsightCategory.BUS_FACTOR_WARNING,
        severity=_severity_for_churn_share(module_trend.churn_share),
        subject=module_trend.module,
        summary=(
            f"Module '{module_trend.module}' accounts for "
            f"{module_trend.churn_share:.0%} of all recorded churn in this analysis."
        ),
        recommendation=(
            "Concentrated change activity in one architectural area increases "
            "key-person risk -- ensure more than one contributor is actively "
            "reviewing and authoring changes here."
        ),
    )


def _severity_for_churn_share(share: float) -> InsightSeverity:
    # Only ever called for modules already filtered to `is_high_churn`
    # (share > 0.5, Task 27) -- always returns a real severity, never None.
    if share >= _BUS_FACTOR_CRITICAL_SHARE:
        return InsightSeverity.CRITICAL
    if share >= _BUS_FACTOR_MAJOR_SHARE:
        return InsightSeverity.MAJOR
    return InsightSeverity.MINOR


class InsightsGenerator:
    """Synthesizes hotspots and structural trends into actionable
    engineering insights (Task 28, §7.4)."""

    def __init__(self) -> None:
        self._log = logger.bind(component="insights_generator")

    def generate_insights(
        self,
        hotspots: list[HotspotMetrics],
        trends: StructuralTrends,
    ) -> list[EngineeringInsight]:
        insights: list[EngineeringInsight] = []

        for hotspot in hotspots:
            high_risk = _high_risk_module_insight(hotspot)
            if high_risk is not None:
                insights.append(high_risk)
            refactoring = _refactoring_insight(hotspot)
            if refactoring is not None:
                insights.append(refactoring)

        for module_trend in trends.module_trends:
            if module_trend.is_high_churn:
                insights.append(_bus_factor_insight(module_trend))

        insights.sort(key=lambda insight: _SEVERITY_ORDER[insight.severity])

        self._log.info(
            "insights_generated",
            insight_count=len(insights),
            hotspot_count=len(hotspots),
            high_churn_module_count=len(trends.high_churn_modules),
        )
        return insights
