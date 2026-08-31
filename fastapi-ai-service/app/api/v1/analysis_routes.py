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

from app.api.deps import get_repository_analysis_service, verify_service_token
from app.api.schemas.analysis_schema import RepositoryAnalysisRequest, RepositoryAnalysisResponse
from app.domain.enums import DocumentType
from app.domain.models import CommitInfo, Document
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
