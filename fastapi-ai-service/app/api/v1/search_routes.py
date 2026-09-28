"""Semantic search endpoints.

Exposes the Semantic Search Service (§5.12) — retrieval without
generation, cheaper and faster than the chat path (Task 53).

Thin by design, same posture as ``ingest_routes.py``: adapts the HTTP
request into the service call and returns its result. Domain
exceptions (``DomainValidationError``, ``EmbeddingError``,
``VectorDBError``) are not caught here -- the single ``seis_error_handler``
registered in ``app.main`` translates every ``SEISError`` subclass to
its JSON error envelope.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import get_semantic_search_service, verify_service_token
from app.api.schemas.search_schema import SearchRequest
from app.domain.models import SearchResponse
from app.services.semantic_search_service import SemanticSearchService

# POST /repositories/{id}/search, per the §11.2 contract.
router = APIRouter(prefix="/repositories", tags=["search"])


@router.post(
    "/{repository_id}/search",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search a repository's indexed chunks by semantic similarity",
)
async def search_repository(
    payload: SearchRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: SemanticSearchService = Depends(get_semantic_search_service),
) -> SearchResponse:
    """Returns the most relevant chunks for ``payload.query`` within
    ``repository_id``'s ChromaDB collection (Task 19's ``VectorRetriever``).

    Raises:
        DomainValidationError: ``repository_id`` or ``query`` is
            blank/whitespace-only (422).
        EmbeddingError: The embedding call failed (502).
        VectorDBError: The ChromaDB query failed (503).
    """
    return await service.search(repository_id=repository_id, query=payload.query)
