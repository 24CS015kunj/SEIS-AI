"""Repository ingestion endpoints.

Entry point Express calls to trigger the Repository Processing Engine
(§6.1 Trigger Contract, §11.2). Accepts and returns immediately
(202 Accepted); processing runs asynchronously (§3.2 Execution Model).

This module is intentionally thin: it adapts an HTTP request into the
frozen domain models Task 30's :class:`RepositoryProcessingService`
already consumes, and adapts its result back into a wire response. No
business logic (locking, status tracking, queue dispatch) is
duplicated here -- Task 30 remains the only path into ingestion. See
that service's own module docstring for why Task 40 (the Celery
worker) does not need to exist yet for this endpoint to be correct.

Domain exceptions raised by the service (``BusinessError``,
``QueueError``, ...) are deliberately not caught here -- every
``SEISError`` subclass already carries its own ``http_status``/``code``
and is translated to a JSON response by the single handler registered
in ``app.main`` (``seis_error_handler``). Catching and re-mapping them
in this module would duplicate that mechanism, not add to it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import get_repository_processing_service, verify_service_token
from app.api.schemas.ingest_schema import IngestRequest, IngestResponse
from app.domain.exceptions import DomainValidationError
from app.domain.models import ManifestFile, RepositoryManifest
from app.services.repository_processing_service import RepositoryProcessingService

# Prefix matches the §11.2 contract: POST /repositories/{id}/ingest and
# POST /repositories/{id}/reindex both live under this router once the
# Repository Processing Engine (Week 3) adds the endpoint functions.
router = APIRouter(prefix="/repositories", tags=["ingestion"])


@router.post(
    "/{repository_id}/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a repository for AI ingestion",
)
async def ingest_repository(
    payload: IngestRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryProcessingService = Depends(get_repository_processing_service),
) -> IngestResponse:
    """Enqueues ``repository_id`` for ingestion via Task 30's service.

    Raises:
        DomainValidationError: ``repository_id`` is blank/whitespace-only
            -- a shape Pydantic's ``Path(min_length=1)`` alone cannot
            catch, since a single space satisfies that constraint.
        BusinessError: Propagated from the service -- a submission is
            already in flight for this repository (422).
        QueueError: Propagated from the service -- the broker rejected
            or failed the dispatch (503).
    """
    if not repository_id.strip():
        raise DomainValidationError(
            "repository_id must not be blank.", details={"repository_id": repository_id}
        )

    manifest = RepositoryManifest(
        repository_id=repository_id,
        workspace_id=payload.workspace_id,
        commit_sha=payload.commit_sha,
        files=[
            ManifestFile(
                path=f.path,
                content=f.content.encode("utf-8") if f.content is not None else None,
                language=f.language,
                size_bytes=f.size_bytes,
            )
            for f in payload.files
        ],
    )

    result = await service.submit_ingestion_job(manifest)

    return IngestResponse(
        repository_id=result.repository_id,
        job_id=result.job_id,
        status=result.status,
        submitted_at=result.submitted_at,
    )
