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
from fastapi.responses import StreamingResponse

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
    """
    request = ChatRequest(
        repository_id=repository_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
        history=[],
    )
    return await service.chat(request)


@router.post(
    "/{repository_id}/chat/stream",
    status_code=status.HTTP_200_OK,
    summary="Stream grounded repository chat response as Server-Sent Events (SSE)",
)
async def stream_chat_with_repository(
    payload: ChatMessageRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryChatService = Depends(get_repository_chat_service),
) -> StreamingResponse:
    """Streams SSE events as tokens arrive from Nemotron Gateway."""
    request = ChatRequest(
        repository_id=repository_id,
        conversation_id=payload.conversation_id,
        message=payload.message,
        history=[],
    )
    generator = service.chat_stream(request)
    return StreamingResponse(generator, media_type="text/event-stream")

