"""Repository Analysis orchestration (Task 69).

Reuses the Phase 5 Core Intelligence engines Tasks 25-28 already built
and tested -- ``CommitAnalyzer`` -> ``ChurnCalculator`` -> ``TrendDetector``
-> ``InsightsGenerator`` -- but stops short of
``EvolutionIndexer.compile_and_index_report`` (Task 29): that step embeds
and upserts three new chunks into the repository's own ChromaDB
collection so evolution reports become searchable via chat, which is a
different feature with its own deliberate side effect on the vector
store. Task 69's own scope is the Dashboard's AI Insights panel, not
making analysis chat-searchable, and its own regression requirement is
"ChromaDB vector count remains unchanged unless analysis genuinely
requires otherwise" -- it does not, here, so this service performs zero
ChromaDB/embedding I/O. Findings are returned to Express, which persists
them into MongoDB's own pre-existing ``Analysis`` collection instead.

No LLM call anywhere in this module (Task 69 §3: "If deterministic
analysis is more appropriate for a particular finding, prefer
deterministic code instead of asking the LLM to guess"). Every one of
Tasks 25-28's engines is a pure function of its inputs -- same
commits/files in, same hotspots/trends/insights out, every time -- which
is exactly why they carry zero fabrication risk and need no LLM-output
validation step: there is no LLM output to validate.

Repository isolation (Task 69 §7): this service only ever operates on
the ``commits``/``files`` explicitly passed into :meth:`analyze` for one
call -- there is no shared cache, no global state, and no repository_id
read from anywhere except the caller's own argument, so a finding here
can never reference another repository's data structurally, not merely
by convention.
"""

from __future__ import annotations

from datetime import UTC, datetime

import structlog

from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.evolution.commit_impact_analyzer import CommitImpactAnalyzer
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.domain.exceptions import DomainValidationError
from app.domain.models import (
    CommitImpactAnalysis,
    CommitInfo,
    Document,
    EngineeringInsight,
    HotspotMetrics,
    StructuralTrends,
)

logger = structlog.get_logger("seis.services.repository_analysis")


class RepositoryAnalysisResult:
    """Plain result container -- not a Pydantic model itself since the
    API layer (``analysis_schema.RepositoryAnalysisResponse``) owns the
    wire contract; this is purely an internal service-to-route handoff,
    same posture as other services returning domain models directly."""

    __slots__ = ("generated_at", "hotspots", "trends", "insights")

    def __init__(
        self,
        generated_at: datetime,
        hotspots: list[HotspotMetrics],
        trends: StructuralTrends,
        insights: list[EngineeringInsight],
    ) -> None:
        self.generated_at = generated_at
        self.hotspots = hotspots
        self.trends = trends
        self.insights = insights


class RepositoryAnalysisService:
    """Orchestrates commit analysis, churn/hotspot scoring, structural
    trend detection, insight generation, and commit impact scoring for one repository (Task 69 / Task #4).
    """

    def __init__(
        self,
        commit_analyzer: CommitAnalyzer,
        churn_calculator: ChurnCalculator,
        trend_detector: TrendDetector,
        insights_generator: InsightsGenerator,
        commit_impact_analyzer: CommitImpactAnalyzer | None = None,
    ) -> None:
        self._commit_analyzer = commit_analyzer
        self._churn_calculator = churn_calculator
        self._trend_detector = trend_detector
        self._insights_generator = insights_generator
        self._commit_impact_analyzer = commit_impact_analyzer or CommitImpactAnalyzer()
        self._log = logger.bind(component="repository_analysis_service")

    async def analyze_commit_impact(
        self,
        repository_id: str,
        commit: CommitInfo,
        files: list[Document] | None = None,
    ) -> CommitImpactAnalysis:
        """Evaluates commit impact, breaking API changes, and architectural risk."""
        if not repository_id.strip():
            raise DomainValidationError(
                "repository_id must not be blank.", details={"repository_id": repository_id}
            )
        return self._commit_impact_analyzer.analyze_commit_impact(
            repository_id=repository_id, commit=commit, files=files
        )

    async def analyze(
        self,
        repository_id: str,
        commits: list[CommitInfo],
        files: list[Document],
    ) -> RepositoryAnalysisResult:
        """Runs the deterministic analysis pipeline for ``repository_id``.

        Raises:
            DomainValidationError: ``commits`` is empty -- there is
                nothing for ``CommitAnalyzer`` to analyze, and returning
                an empty-but-200 result here would look identical to "we
                analyzed this and found nothing", which is a different,
                false claim.
        """
        log = self._log.bind(repository_id=repository_id)
        if not commits:
            raise DomainValidationError(
                "At least one commit is required to run repository analysis.",
                details={"repository_id": repository_id},
            )

        commit_analysis = self._commit_analyzer.analyze_commits(commits)
        hotspots = self._churn_calculator.calculate_hotspots(commit_analysis, files)
        trends = self._trend_detector.detect_trends(hotspots)
        insights = self._insights_generator.generate_insights(hotspots, trends)

        insights = self._validate_grounding(insights, hotspots, trends)

        generated_at = datetime.now(UTC)
        log.info(
            "repository_analysis.completed",
            commit_count=len(commits),
            file_count=len(files),
            hotspot_count=len(hotspots),
            insight_count=len(insights),
        )
        return RepositoryAnalysisResult(
            generated_at=generated_at, hotspots=hotspots, trends=trends, insights=insights
        )

    def _validate_grounding(
        self,
        insights: list[EngineeringInsight],
        hotspots: list[HotspotMetrics],
        trends: StructuralTrends,
    ) -> list[EngineeringInsight]:
        """Defense-in-depth (Task 69 §8.13 "findings cannot reference
        nonexistent repository files"): every insight's ``subject`` must
        be traceable to a real hotspot file path or a real trend module
        this exact call computed -- both are themselves already derived
        only from the ``files``/``commits`` this exact call received, so
        this can never pass for a fabricated subject. Structurally this
        can never actually fail (``InsightsGenerator`` only ever builds a
        ``subject`` from a ``hotspot``/``module_trend`` it was handed),
        but a bug elsewhere in this pipeline degrading into a silently
        ungrounded finding reaching a user is worse than one dropped
        finding here, so this check stays real, not decorative.
        """
        allowed_subjects = {hotspot.file_path for hotspot in hotspots} | {
            trend.module for trend in trends.module_trends
        }
        grounded: list[EngineeringInsight] = []
        for insight in insights:
            if insight.subject in allowed_subjects:
                grounded.append(insight)
            else:
                self._log.warning(
                    "repository_analysis.ungrounded_insight_dropped",
                    category=insight.category.value,
                    subject=insight.subject,
                )
        return grounded
