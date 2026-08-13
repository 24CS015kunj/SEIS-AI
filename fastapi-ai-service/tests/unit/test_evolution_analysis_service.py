"""Unit tests for app/services/evolution_analysis_service.py (Task 31).

Uses real `CommitAnalyzer`/`ChurnCalculator`/`TrendDetector`/
`InsightsGenerator`/`EvolutionIndexer`/`RedisClient` instances whose
public methods are monkeypatched -- the same pattern already used in
tests/unit/test_evolution_indexer.py and
tests/unit/test_repository_processing_service.py, avoiding duck-typed
fakes that would fail the constructor's real type hints.
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime

import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.domain.enums import DocumentType
from app.domain.models import (
    CommitAnalysisResult,
    CommitInfo,
    Document,
    EvolutionReport,
    HotspotMetrics,
    StructuralTrends,
)
from app.infra.cache.cache_client import RedisClient
from app.infra.vectorstore.chroma_client import ChromaClient
from app.services.evolution_analysis_service import (
    _CACHE_KEY_PREFIX,
    _CACHE_TTL_SECONDS,
    EvolutionAnalysisService,
)


def _commit_history(repository_id: str = "repo-1") -> list[CommitInfo]:
    return [CommitInfo(commit_sha="abc123", message="feat: add thing", files_changed=["a.py"])]


def _files() -> list[Document]:
    return [
        Document(
            repository_id="repo-1",
            commit_sha="abc123",
            file_path="a.py",
            content="print(1)\nprint(2)\n",
            language="python",
            document_type=DocumentType.SOURCE_CODE,
        )
    ]


def _commit_analysis() -> CommitAnalysisResult:
    return CommitAnalysisResult(
        total_commits=1,
        file_modification_counts={"a.py": 1},
        file_modification_windows={},
        author_contributions=[],
        commit_type_counts={},
        reference_time=datetime.now(UTC),
    )


def _hotspots() -> list[HotspotMetrics]:
    return [HotspotMetrics(file_path="a.py", commit_count=1, line_count=2, hotspot_score=100.0)]


def _trends() -> StructuralTrends:
    return StructuralTrends(module_trends=[], high_churn_modules=[])


def _report(repository_id: str = "repo-1") -> EvolutionReport:
    return EvolutionReport(
        repository_id=repository_id,
        markdown="# report",
        generated_at=datetime.now(UTC),
        indexed_chunk_count=3,
    )


class Harness:
    def __init__(self) -> None:
        self.cache_store: dict[str, str] = {}
        self.call_order: list[str] = []
        self.calculate_hotspots_args: tuple[object, ...] | None = None
        self.detect_trends_args: tuple[object, ...] | None = None
        self.generate_insights_args: tuple[object, ...] | None = None
        self.compile_args: tuple[object, ...] | None = None
        self.report = _report()

        self.commit_analyzer = CommitAnalyzer()
        self.churn_calculator = ChurnCalculator()
        self.trend_detector = TrendDetector()
        self.insights_generator = InsightsGenerator()
        self.evolution_indexer = EvolutionIndexer(
            chroma_client=ChromaClient(settings=Settings()),
            embedder=NemotronEmbedder(settings=Settings()),
        )
        self.cache = RedisClient(settings=Settings())

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> EvolutionAnalysisService:
        def _analyze_commits(commits: list[CommitInfo], **kwargs: object) -> CommitAnalysisResult:
            self.call_order.append("analyze_commits")
            return _commit_analysis()

        def _calculate_hotspots(
            commit_analysis: CommitAnalysisResult, files: list[Document], **kwargs: object
        ) -> list[HotspotMetrics]:
            self.call_order.append("calculate_hotspots")
            self.calculate_hotspots_args = (commit_analysis, files)
            return _hotspots()

        def _detect_trends(hotspots: list[HotspotMetrics]) -> StructuralTrends:
            self.call_order.append("detect_trends")
            self.detect_trends_args = (hotspots,)
            return _trends()

        def _generate_insights(
            hotspots: list[HotspotMetrics], trends: StructuralTrends
        ) -> list[object]:
            self.call_order.append("generate_insights")
            self.generate_insights_args = (hotspots, trends)
            return []

        async def _compile_and_index_report(
            repository_id: str, analysis_data: dict[str, object]
        ) -> EvolutionReport:
            self.call_order.append("compile_and_index_report")
            self.compile_args = (repository_id, analysis_data)
            return self.report

        async def _get_cache(key: str) -> str | None:
            return self.cache_store.get(key)

        async def _set_cache(key: str, value: str, ttl_seconds: int) -> None:
            self.cache_store[key] = value
            self.call_order.append(f"set_cache:{ttl_seconds}")

        monkeypatch.setattr(self.commit_analyzer, "analyze_commits", _analyze_commits)
        monkeypatch.setattr(self.churn_calculator, "calculate_hotspots", _calculate_hotspots)
        monkeypatch.setattr(self.trend_detector, "detect_trends", _detect_trends)
        monkeypatch.setattr(self.insights_generator, "generate_insights", _generate_insights)
        monkeypatch.setattr(
            self.evolution_indexer, "compile_and_index_report", _compile_and_index_report
        )
        monkeypatch.setattr(self.cache, "get_cache", _get_cache)
        monkeypatch.setattr(self.cache, "set_cache", _set_cache)

        return EvolutionAnalysisService(
            commit_analyzer=self.commit_analyzer,
            churn_calculator=self.churn_calculator,
            trend_detector=self.trend_detector,
            insights_generator=self.insights_generator,
            evolution_indexer=self.evolution_indexer,
            cache_client=self.cache,
            settings=Settings(),
        )


async def test_analyze_evolution_runs_full_pipeline_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    result = await service.analyze_evolution("repo-1", _commit_history(), files=_files())

    assert result == harness.report
    assert harness.call_order[:5] == [
        "analyze_commits",
        "calculate_hotspots",
        "detect_trends",
        "generate_insights",
        "compile_and_index_report",
    ]


async def test_analyze_evolution_passes_correct_data_between_stages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)
    files = _files()

    await service.analyze_evolution("repo-1", _commit_history(), files=files)

    assert harness.calculate_hotspots_args is not None
    _, passed_files = harness.calculate_hotspots_args
    assert passed_files is files

    assert harness.detect_trends_args == (_hotspots(),)
    assert harness.generate_insights_args == (_hotspots(), _trends())

    assert harness.compile_args is not None
    repository_id, analysis_data = harness.compile_args
    assert repository_id == "repo-1"
    assert analysis_data == {
        "hotspots": _hotspots(),
        "trends": _trends(),
        "insights": [],
    }


async def test_analyze_evolution_caches_the_report_with_24h_ttl(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    service = harness.wire(monkeypatch)

    await service.analyze_evolution("repo-1", _commit_history(), files=_files())

    key = f"{_CACHE_KEY_PREFIX}repo-1"
    assert key in harness.cache_store
    assert EvolutionReport.model_validate_json(harness.cache_store[key]) == harness.report
    assert f"set_cache:{_CACHE_TTL_SECONDS}" in harness.call_order
    assert _CACHE_TTL_SECONDS == 86_400


async def test_analyze_evolution_returns_cached_report_without_recomputing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness()
    cached_report = _report("repo-1")
    harness.cache_store[f"{_CACHE_KEY_PREFIX}repo-1"] = cached_report.model_dump_json()
    service = harness.wire(monkeypatch)

    result = await service.analyze_evolution("repo-1", _commit_history(), files=_files())

    assert result == cached_report
    assert harness.call_order == []


def test_files_is_a_required_keyword_only_parameter() -> None:
    params = inspect.signature(EvolutionAnalysisService.analyze_evolution).parameters
    files_param = params["files"]
    assert files_param.kind is inspect.Parameter.KEYWORD_ONLY
    assert files_param.default is inspect.Parameter.empty
