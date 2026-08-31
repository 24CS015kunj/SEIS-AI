"""Repository chat endpoints.

Exposes the Repository Chat Orchestrator (Task 54, §5.11) to Express.
Thin by design, same posture as ``ingest_routes.py``/``search_routes.py``:
adapts the HTTP request into the frozen ``ChatRequest`` domain model
and returns the service's ``ChatResponse`` unchanged. No retrieval,
prompt construction, LLM call, or citation extraction happens here --
all of it lives in ``RepositoryChatService`` (whose LLM Gateway calls
NVIDIA Nemotron 3 Ultra as of Task 60/ADR-008).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import get_repository_chat_service, verify_service_token
from app.api.schemas.chat_schema import ChatMessageRequest
from app.domain.models import ChatRequest, ChatResponse
from app.services.repository_chat_service import RepositoryChatService

# POST /repositories/{id}/chat, per the §11.2 contract.
router = APIRouter(prefix="/repositories", tags=["chat"])


@router.post(
    "/{repository_id}/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a grounded question about a repository's indexed content",
)
async def chat_with_repository(
    payload: ChatMessageRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryChatService = Depends(get_repository_chat_service),
) -> ChatResponse:
    """Delegates to ``RepositoryChatService`` for the full
    retrieve -> rerank -> build context -> prompt -> generate -> cite
    pipeline (Task 54).

    ``history`` is always empty here -- no conversation-history
    persistence mechanism exists yet (see the service module's own
    docstring). ``conversation_id`` is passed through exactly as
    received, never generated or substituted.

    Raises:
        DomainValidationError: ``repository_id``, ``conversation_id``,
            or ``message`` is blank/whitespace-only (422).
        EmbeddingError / VectorDBError / RerankError / LLMError:
            propagated from the pipeline (502/503).
    """
    request = ChatRequest(
        repository_id=repository_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
        history=[],
    )
    return await service.chat(request)
