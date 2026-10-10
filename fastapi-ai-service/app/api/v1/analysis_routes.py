"""Repository analysis endpoints (Task 69).

Exposes ``RepositoryAnalysisService`` (Tasks 25-28's Core Intelligence
engines -- commit analysis, churn/hotspot scoring, structural trend
detection, insight generation) to Express, for the Command Center
Dashboard's AI Insights panel.

Thin by design, same posture as ``chat_routes.py``: adapts the HTTP
request into the engines' domain models and returns the service's result
as ``RepositoryAnalysisResponse``, unchanged. No commit-history or file-
content fetching happens here -- Express already owns that (it is the
side with a real GitHub token and the synced ``Commit``/``File`` Mongo
collections, see ``backend/src/services/analysisEvidence.service.js``)
and sends a bounded, pre-collected payload.

Was previously an empty stub reserved for a "GET /repositories/{id}/evolution"
endpoint that Task 31 never actually built a route for -- that's a
different, larger feature (a full indexed Software Evolution report,
searchable via chat) than this task's narrower scope (Dashboard
insights). This module's own tag stays ``analysis`` rather than
``evolution-analysis`` to keep the two conceptually distinct in the
OpenAPI docs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import (
    get_evolution_analysis_service,
    get_quality_intelligence_service,
    get_repository_analysis_service,
    verify_service_token,
)
from app.api.schemas.analysis_schema import (
    QualityGateResponse,
    RepositoryAnalysisRequest,
    RepositoryAnalysisResponse,
    SEISDiagnosisIssueDTO,
)
from app.domain.enums import DocumentType
from app.domain.models import CommitInfo, Document, EvolutionReport
from app.core.intelligence.quality_intelligence_service import QualityIntelligenceService
from app.services.evolution_analysis_service import EvolutionAnalysisService
from app.services.repository_analysis_service import RepositoryAnalysisService

router = APIRouter(prefix="/repositories", tags=["analysis"])


@router.post(
    "/{repository_id}/analyze",
    response_model=RepositoryAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate deterministic repository analysis findings from real commit/file evidence",
)
async def analyze_repository(
    payload: RepositoryAnalysisRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryAnalysisService = Depends(get_repository_analysis_service),
) -> RepositoryAnalysisResponse:
    """Runs the deterministic analysis pipeline over exactly the
    ``commits``/``files`` supplied in ``payload`` -- never anything else,
    never a cross-repository lookup (Task 69 §7: repository isolation is
    structural here, not a filter applied after the fact).

    Raises:
        DomainValidationError: ``payload.commits`` is empty (422).
    """
    commits = [
        CommitInfo(
            commit_sha=c.commit_sha,
            message=c.message,
            files_changed=c.files_changed,
            author_name=c.author_name,
            author_email=c.author_email,
            committed_at=c.committed_at,
        )
        for c in payload.commits
    ]
    files = [
        Document(
            repository_id=repository_id,
            commit_sha=payload.analyzed_commit_sha,
            file_path=f.file_path,
            content=f.content,
            language=f.language or "unknown",
            document_type=DocumentType.SOURCE_CODE,
        )
        for f in payload.files
    ]

    result = await service.analyze(repository_id, commits, files)
    return RepositoryAnalysisResponse(
        repository_id=repository_id,
        generated_at=result.generated_at,
        analyzed_commit_count=len(commits),
        analyzed_file_count=len(files),
        hotspots=result.hotspots,
        trends=result.trends,
        insights=result.insights,
    )


@router.post(
    "/{repository_id}/commit-impact",
    status_code=status.HTTP_200_OK,
    summary="Analyze architectural change risk, breaking API modifications, and commit impact",
)
async def analyze_commit_impact(
    payload: dict,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryAnalysisService = Depends(get_repository_analysis_service),
):
    """Evaluates commit impact, breaking API changes, and architectural risk."""
    commit_raw = payload.get("commit", {})
    files_raw = payload.get("files", [])

    commit = CommitInfo(
        commit_sha=commit_raw.get("commit_sha", "unknown"),
        message=commit_raw.get("message", ""),
        files_changed=commit_raw.get("files_changed", []),
        author_name=commit_raw.get("author_name"),
        author_email=commit_raw.get("author_email"),
        committed_at=commit_raw.get("committed_at"),
    )
    files = [
        Document(
            repository_id=repository_id,
            commit_sha=commit.commit_sha,
            file_path=f.get("file_path", ""),
            content=f.get("content"),
            language=f.get("language", "unknown"),
            document_type=DocumentType.SOURCE_CODE,
        )
        for f in files_raw
    ]

    return await service.analyze_commit_impact(repository_id, commit, files)


@router.post(
    "/{repository_id}/evolution",
    response_model=EvolutionReport,
    status_code=status.HTTP_200_OK,
    summary="Generate software evolution and historical code churn analytics report",
)
async def analyze_software_evolution(
    payload: RepositoryAnalysisRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: EvolutionAnalysisService = Depends(get_evolution_analysis_service),
) -> EvolutionReport:
    """Executes EvolutionAnalysisService to compute commit churn, module evolution
    trends, hotspot scores, code age distribution, and AI insights with Redis caching."""
    commits = [
        CommitInfo(
            commit_sha=c.commit_sha,
            message=c.message,
            files_changed=c.files_changed,
            author_name=c.author_name,
            author_email=c.author_email,
            committed_at=c.committed_at,
        )
        for c in payload.commits
    ]
    files = [
        Document(
            repository_id=repository_id,
            commit_sha=payload.analyzed_commit_sha,
            file_path=f.file_path,
            content=f.content,
            language=f.language or "unknown",
            document_type=DocumentType.SOURCE_CODE,
        )
        for f in payload.files
    ]

    return await service.analyze_evolution(repository_id, commits, files=files)


@router.post(
    "/{repository_id}/quality-gate",
    response_model=QualityGateResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate software quality gate and produce structured SEIS diagnostic issues",
)
async def evaluate_quality_gate(
    payload: RepositoryAnalysisRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: QualityIntelligenceService = Depends(get_quality_intelligence_service),
) -> QualityGateResponse:
    """Executes QualityIntelligenceService to calculate multi-dimensional scores
    (Architecture, Maintainability, Evolution Risk) and generate structured #SEIS-xxx
    diagnostic findings with evidence trails.
    """
    from datetime import UTC, datetime

    commits = [
        CommitInfo(
            commit_sha=c.commit_sha,
            message=c.message,
            files_changed=c.files_changed,
            author_name=c.author_name,
            author_email=c.author_email,
            committed_at=c.committed_at,
        )
        for c in payload.commits
    ]
    files = [
        Document(
            repository_id=repository_id,
            commit_sha=payload.analyzed_commit_sha,
            file_path=f.file_path,
            content=f.content,
            language=f.language or "unknown",
            document_type=DocumentType.SOURCE_CODE,
        )
        for f in payload.files
    ]

    summary = service.analyze_repository_quality(repository_id, files=files, commits=commits)

    return QualityGateResponse(
        repository_id=repository_id,
        generated_at=datetime.now(UTC),
        overall_score=summary.overall_score,
        architecture_score=summary.architecture_score,
        maintainability_score=summary.maintainability_score,
        evolution_risk_score=summary.evolution_risk_score,
        decision=summary.decision,
        total_files_analyzed=summary.total_files_analyzed,
        total_issues_found=summary.total_issues_found,
        issues=[
            SEISDiagnosisIssueDTO(
                issue_id=i.issue_id,
                target_path=i.target_path,
                component_name=i.component_name,
                category=i.category,
                severity=i.severity,
                confidence=i.confidence,
                problem=i.problem,
                evidence=i.evidence,
                evolution_evidence=i.evolution_evidence,
                recommendation=i.recommendation,
                action_level=i.action_level,
            )
            for i in summary.issues
        ],
    )

