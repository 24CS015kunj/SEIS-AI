"""Software Evolution Analysis Service orchestration (Task 31, §7).

Coordinates the Phase 5 Core Intelligence engines in sequence --
``CommitAnalyzer`` (Task 25) -> ``ChurnCalculator`` (Task 26) ->
``TrendDetector`` (Task 27) -> ``InsightsGenerator`` (Task 28) ->
``EvolutionIndexer`` (Task 29) -- into one callable use case, then caches
the result (Best Practices: "cache generated evolution report payloads
in Redis with a 24-hour TTL"; Common Mistakes: "re-running expensive
commit analysis on every single user request").

``files: list[Document]`` reconciliation -- a genuine gap in this task's
own frozen signature: subtask 2 names ``analyze_evolution(repository_id:
str, commit_history: list[CommitInfo]) -> EvolutionReportResponse``, and
subtask 3 says to "execute ... ChurnCalculator ...", but
``ChurnCalculator.calculate_hotspots`` (Task 26's own frozen signature)
requires a ``files: list[Document]`` argument for line-count-based
scoring, and nothing in ``CommitInfo`` (Task 25) or this task's own
inputs carries file content. There is no infra adapter anywhere in this
codebase that can re-fetch full file content by path once Tasks 13-17's
pipeline has already reduced a repository to embedded chunks -- inventing
one is out of this task's scope, and fabricating placeholder content
would silently produce fake hotspot scores. ``files`` is therefore added
as an additional **required** keyword-only parameter beyond the frozen
two positional ones -- unlike the optional keyword-only extensions used
for ``CommitAnalyzer.reference_time``/``ChurnCalculator.top_n`` (pure
testability knobs with safe defaults), this one has no safe default:
omitting it would mean either fabricating hotspot data or silently
skipping hotspot detection, both worse than a caller-visible
`TypeError` at the call boundary. The eventual real caller (Task 39's
API route, or Task 30's future worker) already has this exact
``list[Document]`` on hand from the same manifest processing pipeline
that produced ``commit_history`` in the first place.

``EvolutionReportResponse`` reconciliation: :class:`~app.domain.models.EvolutionReport`
(Task 29) already models exactly what this task's own Validation
criterion asks for ("returns structured report payload and updates
vector collection") -- reused here rather than inventing a near-duplicate
type, the same reasoning Task 30 applied to
``ProcessingStatusResponse``/``ProcessingStatusRecord``.

Redis caching reconciliation: this task's own ``Dependencies`` line
(``app.core.evolution``, ``app.core.intelligence``, ``app.domain``) omits
``app.infra.cache``, yet its own Best Practices/Common Mistakes text
mandates a specific 24-hour Redis TTL and explicitly warns against
skipping it. Treated the same way Task 30 treated its stale
``app.infra.queue.celery_redis``/``app.infra.cache.redis_client`` module
names: the terse ``Dependencies`` line is incomplete, not authoritative
over the task's own explicit, specific operational requirement.
"""

from __future__ import annotations

import structlog

from app.config.settings import Settings, get_settings
from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.domain.models import CommitInfo, Document, EvolutionReport
from app.infra.cache.cache_client import RedisClient

logger = structlog.get_logger("seis.services.evolution_analysis")

_CACHE_KEY_PREFIX = "seis:evolution-report:"
# Exact value from this task's own Best Practices ("cache generated
# evolution report payloads in Redis with a 24-hour TTL") -- not a
# guessed/invented safety-net number, unlike Task 30's 6h status TTL.
_CACHE_TTL_SECONDS = 86_400


class EvolutionAnalysisService:
    """Orchestrates commit analysis, churn/hotspot scoring, structural
    trend detection, insight generation, and evolution report indexing
    (Task 31 subtasks 1-4)."""

    def __init__(
        self,
        commit_analyzer: CommitAnalyzer,
        churn_calculator: ChurnCalculator,
        trend_detector: TrendDetector,
        insights_generator: InsightsGenerator,
        evolution_indexer: EvolutionIndexer,
        cache_client: RedisClient,
        settings: Settings | None = None,
    ) -> None:
        self._commit_analyzer = commit_analyzer
        self._churn_calculator = churn_calculator
        self._trend_detector = trend_detector
        self._insights_generator = insights_generator
        self._evolution_indexer = evolution_indexer
        self._cache_client = cache_client
        self.settings = settings or get_settings()
        self._log = logger.bind(component="evolution_analysis_service")

    async def analyze_evolution(
        self,
        repository_id: str,
        commit_history: list[CommitInfo],
        *,
        files: list[Document],
    ) -> EvolutionReport:
        """Runs the full evolution analysis pipeline for ``repository_id``
        (Task 31 subtasks 2-4), serving a cached report when available.

        Args:
            repository_id: The repository being analyzed.
            commit_history: Raw commit history (``CommitAnalyzer``'s input).
            files: Full file content for every file referenced in
                ``commit_history`` (``ChurnCalculator``'s input) -- see
                module docstring for why this is required here despite
                not appearing in the task's own frozen positional
                signature.
        """
        log = self._log.bind(repository_id=repository_id)
        cache_key = f"{_CACHE_KEY_PREFIX}{repository_id}"

        cached = await self._cache_client.get_cache(cache_key)
        if cached is not None:
            log.debug("evolution_analysis.cache_hit")
            return EvolutionReport.model_validate_json(cached)

        log.debug("evolution_analysis.cache_miss")
        commit_analysis = self._commit_analyzer.analyze_commits(commit_history)
        hotspots = self._churn_calculator.calculate_hotspots(commit_analysis, files)
        trends = self._trend_detector.detect_trends(hotspots)
        insights = self._insights_generator.generate_insights(hotspots, trends)

        report = await self._evolution_indexer.compile_and_index_report(
            repository_id,
            {"hotspots": hotspots, "trends": trends, "insights": insights},
        )

        await self._cache_client.set_cache(cache_key, report.model_dump_json(), _CACHE_TTL_SECONDS)
        log.info(
            "evolution_analysis.report_generated",
            hotspot_count=len(hotspots),
            insight_count=len(insights),
            indexed_chunk_count=report.indexed_chunk_count,
        )
        return report
