"""Unit tests for RepositoryAnalysisService (Task 69).

Uses the real Tasks 25-28 engines (all pure, deterministic, no I/O) --
no fakes needed for the happy paths. `_validate_grounding` is exercised
with a deliberately-broken InsightsGenerator stub to prove the defense-
in-depth check actually drops an ungrounded finding rather than merely
existing in the docstring.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.domain.enums import DocumentType, InsightCategory, InsightSeverity
from app.domain.exceptions import DomainValidationError
from app.domain.models import CommitInfo, Document, EngineeringInsight
from app.services.repository_analysis_service import RepositoryAnalysisService


def _service() -> RepositoryAnalysisService:
    return RepositoryAnalysisService(
        commit_analyzer=CommitAnalyzer(),
        churn_calculator=ChurnCalculator(),
        trend_detector=TrendDetector(),
        insights_generator=InsightsGenerator(),
    )


def _commit(sha: str, files: list[str], when: datetime) -> CommitInfo:
    return CommitInfo(
        commit_sha=sha,
        message="fix: something",
        files_changed=files,
        author_name="Nikunj Desai",
        author_email="nikunj@example.com",
        committed_at=when,
    )


def _document(repository_id: str, path: str, lines: int) -> Document:
    return Document(
        repository_id=repository_id,
        commit_sha="deadbeef",
        file_path=path,
        content="\n".join(f"line {i}" for i in range(lines)),
        language="python",
        document_type=DocumentType.SOURCE_CODE,
    )


NOW = datetime(2026, 8, 29, tzinfo=UTC)


# ---------------------------------------------------------------------------
# 1. Empty commits is rejected, not silently analyzed into an empty result.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_empty_commits_raises_domain_validation_error() -> None:
    service = _service()

    with pytest.raises(DomainValidationError):
        await service.analyze("repo-1", commits=[], files=[])


# ---------------------------------------------------------------------------
# 2. A real, heavily-churned large file produces a real, evidenced finding.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_a_large_frequently_changed_file_produces_a_grounded_finding() -> None:
    service = _service()
    commits = [_commit(f"sha{i}", ["backend/maze.py"], NOW) for i in range(12)]
    files = [_document("repo-1", "backend/maze.py", lines=650)]

    result = await service.analyze("repo-1", commits, files)

    assert result.hotspots[0].file_path == "backend/maze.py"
    assert result.hotspots[0].commit_count == 12
    assert result.hotspots[0].line_count == 650
    assert any(i.subject == "backend/maze.py" for i in result.insights)
    # Every insight's subject must be traceable to a real hotspot/module
    # this exact call computed -- never an invented file/module name.
    allowed = {h.file_path for h in result.hotspots} | {
        t.module for t in result.trends.module_trends
    }
    assert all(i.subject in allowed for i in result.insights)


# ---------------------------------------------------------------------------
# 3. A dominant hotspot alongside quiet, tiny files: only the genuinely
#    risky file gets flagged -- the quiet ones are never padded with a
#    finding just to look complete. (`ChurnCalculator` normalizes every
#    hotspot's score relative to the single highest raw score *in the
#    candidate set*, so the top-ranked file is always exactly 100/100 by
#    construction -- this is that pre-existing, already-tested engine's
#    real behavior, not something this service invents; a set with only
#    one candidate would always make that one candidate "100/100", which
#    is why this test uses three files with a clear dominant/quiet split
#    instead of relying on absolute smallness alone.)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_quiet_files_alongside_a_real_hotspot_are_never_flagged() -> None:
    service = _service()
    commits = [_commit(f"sha{i}", ["backend/maze.py"], NOW) for i in range(12)] + [
        _commit("sha-quiet-1", ["docs/README.md"], NOW),
        _commit("sha-quiet-2", ["scripts/build.sh"], NOW),
    ]
    files = [
        _document("repo-1", "backend/maze.py", lines=650),
        _document("repo-1", "docs/README.md", lines=5),
        _document("repo-1", "scripts/build.sh", lines=5),
    ]

    result = await service.analyze("repo-1", commits, files)

    flagged_subjects = {i.subject for i in result.insights}
    assert "backend/maze.py" in flagged_subjects
    assert "docs/README.md" not in flagged_subjects
    assert "scripts/build.sh" not in flagged_subjects


# ---------------------------------------------------------------------------
# 4. A file changed in commits but with no matching Document is skipped,
#    never scored with a guessed/zero line count standing in for real data.
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_a_changed_file_with_no_supplied_content_is_never_scored() -> None:
    service = _service()
    commits = [_commit("sha1", ["backend/secret.bin"], NOW)]

    result = await service.analyze("repo-1", commits, files=[])

    assert result.hotspots == []
    assert result.insights == []


# ---------------------------------------------------------------------------
# 5. Repository isolation: two calls for different repositories never
#    leak state (both engines/service are stateless per-call).
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_two_repositories_analyzed_in_sequence_do_not_leak_into_each_other() -> None:
    service = _service()

    result_a = await service.analyze(
        "repo-a",
        commits=[_commit("sha1", ["a/hot.py"], NOW) for _ in range(10)],
        files=[_document("repo-a", "a/hot.py", lines=500)],
    )
    result_b = await service.analyze(
        "repo-b",
        commits=[_commit("sha2", ["b/quiet.py"], NOW)],
        files=[_document("repo-b", "b/quiet.py", lines=3)],
    )

    assert any(h.file_path == "a/hot.py" for h in result_a.hotspots)
    assert not any(h.file_path == "a/hot.py" for h in result_b.hotspots)
    # repo-b's own quiet file is real, present, and correctly reflects its
    # own (small) real commit/line counts -- never repo-a's data.
    assert [h.file_path for h in result_b.hotspots] == ["b/quiet.py"]
    assert result_b.hotspots[0].commit_count == 1
    assert result_b.hotspots[0].line_count == 3


# ---------------------------------------------------------------------------
# 6. Grounding validation actually drops an ungrounded finding (defense in
#    depth) rather than merely documenting the intent.
# ---------------------------------------------------------------------------
class _BrokenInsightsGenerator:
    """Deliberately returns an insight whose subject was never computed by
    this call's own hotspots/trends -- simulates a hypothetical future bug
    elsewhere in the pipeline, to prove `_validate_grounding` really drops
    it instead of only claiming to in a docstring."""

    def generate_insights(self, hotspots: object, trends: object) -> list[EngineeringInsight]:
        return [
            EngineeringInsight(
                category=InsightCategory.HIGH_RISK_MODULE,
                severity=InsightSeverity.CRITICAL,
                subject="totally/invented/file.py",
                summary="This subject was never in the supplied evidence.",
                recommendation="n/a",
            )
        ]


@pytest.mark.asyncio
async def test_an_ungrounded_insight_is_dropped_not_returned() -> None:
    service = RepositoryAnalysisService(
        commit_analyzer=CommitAnalyzer(),
        churn_calculator=ChurnCalculator(),
        trend_detector=TrendDetector(),
        insights_generator=_BrokenInsightsGenerator(),  # type: ignore[arg-type]
    )
    commits = [_commit(f"sha{i}", ["backend/maze.py"], NOW) for i in range(12)]
    files = [_document("repo-1", "backend/maze.py", lines=650)]

    result = await service.analyze("repo-1", commits, files)

    assert result.insights == []
