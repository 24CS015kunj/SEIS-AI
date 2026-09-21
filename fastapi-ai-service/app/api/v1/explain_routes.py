"""Repository explanation endpoints (Task 93).

Exposes two AI-powered explanation flows to Express under a single route,
distinguished by ``task_type``:

``code_explanation``
    Grounded explanation of a specific repository file (activates the
    long-defined but previously unused ``TaskType.CODE_EXPLANATION``).
    Retrieval queries include the target filename so that
    ``LexicalRetriever``'s existing filename/path-segment scoring
    naturally surfaces chunks from that file without any change to
    ``LexicalRetriever.retrieve``'s signature.  The semantic pool is
    additionally post-filtered (file-path prefix match) after retrieval
    and before reranking to bias context towards the target file; chunks
    from other files fill any remaining context budget so the explanation
    isn't artificially starved of surrounding context.

``architecture_summary``
    Repository-wide architectural overview (activates
    ``TaskType.ARCHITECTURE_SUMMARY``).  Uses a wider retrieval pool
    (top_k=30) and a larger context budget (8,000 tokens) to cover
    representative files across the whole repository.

Both flows reuse the existing, live-verified pipeline components
(``VectorRetriever``, ``LexicalRetriever``, ``RAGOptimizer``,
``ContextBuilder``, ``NemotronGateway``, ``CitationEngine``) and the two
new prompt templates added to ``PromptBuilder`` in this task.

Design decisions:

* **One route, two task types** -- a single ``POST .../explain`` is
  simpler to proxy through Express than two separate routes, and keeps
  the authentication/dependency chain identical for both flows.

* **No conversation history** -- explanations are one-shot artifacts,
  not conversational exchanges; ``ConversationStore`` is deliberately
  not called (no Redis I/O on the critical path).

* **No streaming** -- both flows complete in 2--5 s under typical load
  (narrower retrieval than a full chat turn); streaming would add
  significant Express-proxy complexity for that latency range.

* **Dependency injection** -- a dedicated ``get_explain_service``
  provider in ``deps.py`` wires the pipeline; the route itself only
  calls ``service.explain()``, the same thin-route pattern every other
  route in this package already uses (``chat_routes.py``,
  ``analysis_routes.py``).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status

from app.api.deps import get_explain_service, verify_service_token
from app.api.schemas.explain_schema import ExplainRequest, ExplainResponse
from app.services.repository_explain_service import RepositoryExplainService

router = APIRouter(prefix="/repositories", tags=["explain"])


@router.post(
    "/{repository_id}/explain",
    response_model=ExplainResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a grounded AI explanation for a file or the repository architecture",
)
async def explain_repository(
    payload: ExplainRequest,
    repository_id: str = Path(min_length=1, description="Repository identifier."),
    _service_token: str = Depends(verify_service_token),
    service: RepositoryExplainService = Depends(get_explain_service),
) -> ExplainResponse:
    """Delegates to ``RepositoryExplainService.explain()`` for the full
    retrieval → context → prompt → generate → cite pipeline.

    Raises:
        DomainValidationError: ``file_path`` missing for
            ``code_explanation``, or path contains traversal components.
        EmbeddingError / VectorDBError / RerankError / LLMError:
            propagated from the pipeline.
    """
    result = await service.explain(
        repository_id=repository_id,
        task_type=payload.task_type,
        file_path=payload.file_path,
    )
    return ExplainResponse(
        task_type=payload.task_type,
        file_path=payload.file_path,
        answer=result.answer,
        citations=result.citations,
    )
