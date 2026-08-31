"""Shared FastAPI dependencies.

Provides the service-to-service auth guard (§26.1-§26.2) and injected
access to settings, the structured logger, and infrastructure clients
(ChromaDB, NVIDIA Nemotron) used across route handlers (§8 Dependency
Injection).
"""

from functools import lru_cache
from typing import cast

import structlog
from celery import Celery  # type: ignore[import-untyped]
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.core.generation.citation_engine import CitationEngine
from app.core.generation.conversation_store import ConversationStore
from app.core.generation.prompt_builder import PromptBuilder
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.core.retrieval.context_builder import ContextBuilder
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.query_rewriter import QueryRewriter
from app.core.retrieval.rag_optimizer import RAGOptimizer
from app.core.retrieval.repository_structure import RepositoryStructureService
from app.core.retrieval.retriever import VectorRetriever
from app.domain.exceptions import SEISAuthorizationError
from app.infra.cache.cache_client import RedisClient
from app.infra.llm.gemini_client import NemotronGateway
from app.infra.queue.task_queue import celery_app
from app.infra.vectorstore.chroma_client import ChromaClient
from app.services.evaluation_service import EvaluationService
from app.services.evolution_analysis_service import EvolutionAnalysisService
from app.services.repository_analysis_service import RepositoryAnalysisService
from app.services.repository_chat_service import RepositoryChatService
from app.services.repository_processing_service import RepositoryProcessingService
from app.services.semantic_search_service import SemanticSearchService

# Optional HTTPBearer security scheme -- auto_error=False allows custom SEIS exception handling
security_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Core Configuration & Observability Dependencies
# ---------------------------------------------------------------------------
def get_settings_dep() -> Settings:
    """FastAPI dependency provider for process-wide Settings.

    Wraps the process-wide :func:`app.config.settings.get_settings` cached
    singleton so route handlers and downstream dependencies can inject
    typed configuration via ``settings: Settings = Depends(get_settings_dep)``.
    """
    return get_settings()


def get_logger_dep() -> structlog.stdlib.BoundLogger:
    """FastAPI dependency provider for request-context structlog logger."""
    return cast(structlog.stdlib.BoundLogger, structlog.get_logger("seis.api"))


def get_correlation_id_dep() -> str:
    """FastAPI dependency provider extracting current correlation ID."""
    return str(structlog.contextvars.get_contextvars().get("correlation_id", "-"))


# ---------------------------------------------------------------------------
# Service Auth Guard Dependency (§26.1 - §26.2)
# ---------------------------------------------------------------------------
async def verify_service_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    settings: Settings = Depends(get_settings_dep),
) -> str:
    """Service-to-service authentication guard dependency (§26.1-§26.2).

    This dependency exists ONLY for internal service-to-service authentication.
    It validates the trust boundary between Express Backend Gateway and FastAPI:

        Browser -> React Frontend -> Express Gateway -> FastAPI AI Service

    It is NOT:
    - GitHub OAuth authentication (owned 100% by Express Gateway)
    - User JWT authentication (owned 100% by Express Gateway)
    - Browser or end-user authentication

    Separation Rationale:
    Express owns user identity, workspace authorization, and GitHub tokens.
    FastAPI operates as a private AI microservice, validating internal service
    credentials (`settings.internal_api_key`) presented by Express.

    Raises:
        SEISAuthorizationError: If the token is missing or invalid when internal
            API key verification is required.
    """
    secret_key = settings.internal_api_key.get_secret_value()

    # If no secret key is configured (development/testing default), pass through
    if not secret_key:
        return "development-unauthenticated"

    if not credentials or not credentials.scheme or credentials.scheme.lower() != "bearer":
        raise SEISAuthorizationError(
            message="Missing or malformed Authorization header. Expected Bearer token.",
            details={"scheme": credentials.scheme if credentials else None},
        )

    if credentials.credentials != secret_key:
        raise SEISAuthorizationError(
            message="Invalid service authentication token.",
            details={"reason": "token_mismatch"},
        )

    return credentials.credentials


# ---------------------------------------------------------------------------
# Service Layer Dependency Providers (Level 3 Clean Architecture)
# ---------------------------------------------------------------------------
# get_semantic_search_service and get_repository_chat_service both moved
# below the Infrastructure Client Providers section (Tasks 53/54) -- they
# construct real infra-backed components whose Depends() defaults
# reference get_chroma_client/get_embedder/get_nemotron_gateway/
# get_rag_optimizer, so those names must already be bound (same reasoning
# already documented above get_repository_processing_service).


def get_evaluation_service(
    settings: Settings = Depends(get_settings_dep),
) -> EvaluationService:
    """Dependency provider for EvaluationService.

    Constructor Design Evolution:
    Will evolve to accept RepositoryChatService and GoldenDataset Evaluator via
    constructor injection in Tasks 9-12 without modifying API route signatures.
    """
    return EvaluationService(settings=settings)


# ---------------------------------------------------------------------------
# Infrastructure Client Providers (Level 1 Clean Architecture - Tasks 9-12)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def get_chroma_client() -> ChromaClient:
    """FastAPI dependency provider for the process-wide ChromaDB adapter (Task 9).

    ``lru_cache`` gives ``ChromaClient`` the same process-lifetime
    singleton semantics as :func:`app.config.settings.get_settings` --
    one instance per process, never rebuilt per request or per vector
    operation. Construction itself is cheap and lazy (the underlying
    ``chromadb`` SDK client is built on first real use inside
    ``ChromaClient``, not here), so this is safe to call from a
    ``Depends()`` on every request without adding request latency.
    """
    return ChromaClient(settings=get_settings())


@lru_cache(maxsize=1)
def get_cache_client() -> RedisClient:
    """FastAPI dependency provider for the process-wide Redis cache adapter (Task 10).

    Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_chroma_client` (Task 9) -- one ``RedisClient`` per
    process, constructed lazily on first real use, never rebuilt per
    request or per cache operation.
    """
    return RedisClient(settings=get_settings())


def get_task_queue() -> Celery:
    """FastAPI dependency provider for the process-wide Celery task queue (Task 11).

    Unlike :func:`get_chroma_client`/:func:`get_cache_client`, no
    ``lru_cache`` wrapper is needed here: ``celery_app``
    (``app.infra.queue.task_queue``) is already a single, process-wide
    module-level object built once at import time -- this provider
    exists only so route handlers can request it the same way as every
    other infrastructure client, via ``Depends(get_task_queue)``,
    without importing ``app.infra.queue`` directly.
    """
    return celery_app


@lru_cache(maxsize=1)
def get_nemotron_gateway() -> NemotronGateway:
    """FastAPI dependency provider for the process-wide LLM generation
    gateway (Task 12; renamed from ``get_gemini_gateway`` and migrated to
    NVIDIA Nemotron 3 Ultra in Task 60/ADR-008 -- unlike the module file
    it's defined in, a provider function is not covered by the project's
    frozen-file-tree rule, so it is renamed here the same way the class
    it returns was).

    Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_chroma_client`/:func:`get_cache_client` -- one
    ``NemotronGateway`` per process, constructed lazily (the underlying
    ``httpx.AsyncClient`` is built on first real call inside
    ``NemotronGateway``, not here, so a missing ``NVIDIA_API_KEY`` never
    prevents the process from starting).
    """
    return NemotronGateway(settings=get_settings())


@lru_cache(maxsize=1)
def get_rag_optimizer() -> RAGOptimizer:
    """FastAPI dependency provider for the process-wide RAG Optimizer
    (Task 24). Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_nemotron_gateway`/:func:`get_embedder` -- it lazily builds
    and holds one ``httpx.AsyncClient`` for NVIDIA's hosted reranking
    API, so a new instance per request would leak a client per call
    instead of reusing one for the process lifetime. A missing
    ``NVIDIA_API_KEY`` never prevents the process from starting; it
    only fails an actual rerank call (Task 54).
    """
    return RAGOptimizer(settings=get_settings())


@lru_cache(maxsize=1)
def get_embedder() -> NemotronEmbedder:
    """FastAPI dependency provider for the process-wide embedding client
    (ADR-007). Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_nemotron_gateway` -- constructed lazily, so a missing
    ``NVIDIA_API_KEY`` never prevents the process from starting. First
    needed by a route/service provider in Task 31 (``EvolutionIndexer``
    requires it); no provider existed for it before this task since
    nothing above the Core layer called into embedding directly.
    """
    return NemotronEmbedder(settings=get_settings())


# ---------------------------------------------------------------------------
# Service Layer Dependency Providers requiring infra clients (Task 30+)
# ---------------------------------------------------------------------------
# Placed after the Infrastructure Client Providers above (rather than
# alongside the other, still-settings-only Service Layer providers
# further up this file) because its Depends() defaults reference
# get_cache_client/get_task_queue -- default argument values are
# evaluated at `def` time, so those names must already be bound.
def get_repository_processing_service(
    settings: Settings = Depends(get_settings_dep),
    cache_client: RedisClient = Depends(get_cache_client),
    task_queue: Celery = Depends(get_task_queue),
) -> RepositoryProcessingService:
    """Dependency provider for RepositoryProcessingService (Task 30).

    The first Service Layer provider to wire real infrastructure
    adapters (Redis locking/status, Celery job dispatch) rather than
    just Settings -- every other provider above still awaits its own
    task before evolving the same way.
    """
    return RepositoryProcessingService(
        cache_client=cache_client, task_queue=task_queue, settings=settings
    )


def get_semantic_search_service(
    settings: Settings = Depends(get_settings_dep),
    chroma_client: ChromaClient = Depends(get_chroma_client),
    embedder: NemotronEmbedder = Depends(get_embedder),
) -> SemanticSearchService:
    """Dependency provider for SemanticSearchService (Task 53).

    Constructs the ``VectorRetriever`` (Task 19) inline from the two
    process-wide infra singletons it needs -- no separate
    ``get_vector_retriever`` provider, same "no DI provider for a
    component with no independent lifecycle of its own" pattern
    ``get_evolution_analysis_service`` already uses for its
    ``EvolutionIndexer``.
    """
    retriever = VectorRetriever(chroma_client=chroma_client, embedder=embedder)
    return SemanticSearchService(retriever=retriever, settings=settings)


def get_repository_chat_service(
    settings: Settings = Depends(get_settings_dep),
    chroma_client: ChromaClient = Depends(get_chroma_client),
    embedder: NemotronEmbedder = Depends(get_embedder),
    llm_gateway: NemotronGateway = Depends(get_nemotron_gateway),
    rag_optimizer: RAGOptimizer = Depends(get_rag_optimizer),
    cache_client: RedisClient = Depends(get_cache_client),
) -> RepositoryChatService:
    """Dependency provider for RepositoryChatService (Task 54).

    Constructs ``VectorRetriever``, ``LexicalRetriever`` (Task 63),
    ``ContextBuilder``, ``PromptBuilder``, ``CitationEngine``,
    ``ConversationStore`` (Task 65), ``QueryRewriter`` (Task 66), and
    ``RepositoryStructureService`` (Task 67) inline -- none of them hold
    a client worth caching across requests (unlike ``RAGOptimizer``/
    ``NemotronGateway``/``ChromaClient``/``RedisClient``, each already a
    singleton via its own provider) -- same "no separate DI provider for
    a component with no independent lifecycle of its own" pattern
    ``get_evolution_analysis_service`` already uses for its
    ``EvolutionIndexer``. ``QueryRewriter`` is pure/stateless (no I/O, no
    LLM call -- see its own module docstring), so it needs no injected
    dependency at all; ``RepositoryStructureService`` needs only the
    already-injected ``chroma_client``, same as ``LexicalRetriever``.
    """
    retriever = VectorRetriever(chroma_client=chroma_client, embedder=embedder)
    lexical_retriever = LexicalRetriever(chroma_client=chroma_client)
    context_builder = ContextBuilder(llm_gateway=llm_gateway)
    conversation_store = ConversationStore(cache_client=cache_client, settings=settings)
    structure_service = RepositoryStructureService(chroma_client=chroma_client)
    return RepositoryChatService(
        retriever=retriever,
        lexical_retriever=lexical_retriever,
        rag_optimizer=rag_optimizer,
        context_builder=context_builder,
        prompt_builder=PromptBuilder(),
        llm_gateway=llm_gateway,
        citation_engine=CitationEngine(),
        conversation_store=conversation_store,
        query_rewriter=QueryRewriter(),
        structure_service=structure_service,
        settings=settings,
    )


def get_repository_analysis_service() -> RepositoryAnalysisService:
    """Dependency provider for RepositoryAnalysisService (Task 69).

    All four Core Intelligence engines it wraps (``CommitAnalyzer``,
    ``ChurnCalculator``, ``TrendDetector``, ``InsightsGenerator``) are
    stateless (no constructor dependencies, no I/O) -- same "no
    connection/resource to reuse, so a new instance per request is both
    correct and cheap" reasoning :func:`get_evolution_analysis_service`
    already documents for these exact same engine types. No settings, no
    infra client: this provider takes no ``Depends()`` at all.
    """
    return RepositoryAnalysisService(
        commit_analyzer=CommitAnalyzer(),
        churn_calculator=ChurnCalculator(),
        trend_detector=TrendDetector(),
        insights_generator=InsightsGenerator(),
    )


def get_evolution_analysis_service(
    settings: Settings = Depends(get_settings_dep),
    cache_client: RedisClient = Depends(get_cache_client),
    chroma_client: ChromaClient = Depends(get_chroma_client),
    embedder: NemotronEmbedder = Depends(get_embedder),
) -> EvolutionAnalysisService:
    """Dependency provider for EvolutionAnalysisService (Task 31).

    The Core Intelligence engines (``CommitAnalyzer``, ``ChurnCalculator``,
    ``TrendDetector``, ``InsightsGenerator``) are stateless (no
    constructor dependencies) and built fresh here rather than cached as
    process-wide singletons -- unlike the infra clients above, there is
    no connection/resource to reuse, so a new instance per request is
    both correct and cheap.
    """
    evolution_indexer = EvolutionIndexer(chroma_client=chroma_client, embedder=embedder)
    return EvolutionAnalysisService(
        commit_analyzer=CommitAnalyzer(),
        churn_calculator=ChurnCalculator(),
        trend_detector=TrendDetector(),
        insights_generator=InsightsGenerator(),
        evolution_indexer=evolution_indexer,
        cache_client=cache_client,
        settings=settings,
    )


# ---------------------------------------------------------------------------
# Readiness Check Registration (Tasks 9-10)
# ---------------------------------------------------------------------------
# Imported and registered here -- after every provider above is defined --
# rather than at module top. `app.api.v1.health_routes` lives inside the
# same `app.api.v1` package as `ingest_routes` (Task 36), which needs
# `verify_service_token`/`get_repository_processing_service` from this
# module. Importing `health_routes` at the top of this file forced Python
# to load the whole `app.api.v1` package -- including `ingest_routes` --
# before those two names existed yet: a circular import that stayed latent
# until a real (non-stub) route in that package first needed them. Moving
# the import below everything `app.api.v1` might need breaks the cycle
# without changing what gets registered, or when, relative to application
# startup -- this still all runs at import time, before the app serves a
# single request.
from app.api.v1.health_routes import register_readiness_check  # noqa: E402


async def _chroma_readiness_check() -> bool:
    return await get_chroma_client().health_check()


register_readiness_check("chromadb", _chroma_readiness_check)


async def _redis_readiness_check() -> bool:
    return await get_cache_client().health_check()


register_readiness_check("redis", _redis_readiness_check)
