"""Shared FastAPI dependencies.

Provides the service-to-service auth guard (§26.1-§26.2) and injected
access to settings, the structured logger, and infrastructure clients
(ChromaDB, NVIDIA Nemotron) used across route handlers (§8 Dependency
Injection).
"""

from functools import lru_cache
from typing import cast

import structlog
from fastapi import Depends
from fastapi.params import Depends as DependsClass
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache
from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.core.generation.citation_engine import CitationEngine
from app.core.generation.conversation_store import ConversationStore
from app.core.generation.prompt_builder import PromptBuilder
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.core.retrieval.context_builder import ContextBuilder
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.query_rewriter import QueryRewriter
from app.core.retrieval.rag_optimizer import RAGOptimizer
from app.core.retrieval.repository_structure import RepositoryStructureService
from app.core.retrieval.retriever import VectorRetriever
from app.domain.exceptions import SEISAuthorizationError
from app.infra.cache.cache_client import RedisClient
from app.infra.http.express_client import ExpressCallbackClient
from app.infra.llm.gemini_client import NemotronGateway
from app.infra.vectorstore.client import VectorStoreClient, create_vector_store
from app.services.evaluation_service import EvaluationService
from app.services.evolution_analysis_service import EvolutionAnalysisService
from app.services.job_manager import IngestionJobManager
from app.services.repository_analysis_service import RepositoryAnalysisService
from app.services.repository_chat_service import RepositoryChatService
from app.services.repository_explain_service import RepositoryExplainService
from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService
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
def get_chroma_client() -> VectorStoreClient:
    """Compatibility provider for the explicitly selected vector store.

    One lazy instance per process; both Chroma rollback and Qdrant use
    the same caller contract. Network failures never switch backends.
    """
    return create_vector_store(get_settings())


@lru_cache(maxsize=1)
def get_cache_client() -> RedisClient:
    """FastAPI dependency provider for the process-wide Redis cache adapter (Task 10).

    Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_chroma_client` (Task 9) -- one ``RedisClient`` per
    process, constructed lazily on first real use, never rebuilt per
    request or per cache operation.
    """
    return RedisClient(settings=get_settings())


@lru_cache(maxsize=1)
def get_express_callback_client() -> ExpressCallbackClient:
    """FastAPI dependency provider for outbound Express callback client."""
    return ExpressCallbackClient(settings=get_settings())


@lru_cache(maxsize=1)
def get_embedding_cache() -> EmbeddingCache:
    """FastAPI dependency provider for process-wide EmbeddingCache."""
    return EmbeddingCache(redis_client=get_cache_client(), settings=get_settings())


@lru_cache(maxsize=1)
def get_nemotron_gateway() -> NemotronGateway:
    """FastAPI dependency provider for the process-wide LLM generation gateway."""
    return NemotronGateway(settings=get_settings())


@lru_cache(maxsize=1)
def get_rag_optimizer() -> RAGOptimizer:
    """FastAPI dependency provider for the process-wide RAG Optimizer."""
    return RAGOptimizer(settings=get_settings())


@lru_cache(maxsize=1)
def get_embedder() -> NemotronEmbedder:
    """FastAPI dependency provider for the process-wide embedding client."""
    return NemotronEmbedder(settings=get_settings())


@lru_cache(maxsize=1)
def get_ingestion_worker_service() -> RepositoryIngestionWorkerService:
    """FastAPI dependency provider for RepositoryIngestionWorkerService.

    Constructs the end-to-end processing pipeline injecting lazy singleton
    infrastructure clients.
    """
    return RepositoryIngestionWorkerService(
        chroma_client=get_chroma_client(),
        document_processor=DocumentProcessor(),
        chunker=ASTChunker(),
        metadata_generator=MetadataGenerator(),
        embedder=get_embedder(),
        embedding_cache=get_embedding_cache(),
        cache_client=get_cache_client(),
        express_callback_client=get_express_callback_client(),
    )


@lru_cache(maxsize=1)
def get_job_manager() -> IngestionJobManager:
    """FastAPI dependency provider for the in-process Background Ingestion Job Manager (Task T5).

    Singleton managing bounded background tasks within the application lifespan.
    """
    return IngestionJobManager(
        worker_factory=get_ingestion_worker_service,
        settings=get_settings(),
        cache_client=get_cache_client(),
        express_callback_client=get_express_callback_client(),
    )


# ---------------------------------------------------------------------------
# Service Layer Dependency Providers requiring infra clients (Task 30+)
# ---------------------------------------------------------------------------
def get_repository_processing_service(
    settings: Settings = Depends(get_settings_dep),
    cache_client: RedisClient = Depends(get_cache_client),
    job_manager: IngestionJobManager = Depends(get_job_manager),
    express_callback_client: ExpressCallbackClient = Depends(get_express_callback_client),
) -> RepositoryProcessingService:
    """Dependency provider for RepositoryProcessingService (Task 30, Task T5).

    Wires Redis locking/status, in-process job manager, and outbound callback client.
    """
    actual_settings = get_settings_dep() if isinstance(settings, DependsClass) else settings
    actual_cache = get_cache_client() if isinstance(cache_client, DependsClass) else cache_client
    actual_job_manager = get_job_manager() if isinstance(job_manager, DependsClass) else job_manager
    actual_callback = (
        get_express_callback_client()
        if isinstance(express_callback_client, DependsClass)
        else express_callback_client
    )
    return RepositoryProcessingService(
        cache_client=actual_cache,
        job_manager=actual_job_manager,
        express_callback_client=actual_callback,
        settings=actual_settings,
    )


def get_semantic_search_service(
    settings: Settings = Depends(get_settings_dep),
    chroma_client: VectorStoreClient = Depends(get_chroma_client),
    embedder: NemotronEmbedder = Depends(get_embedder),
    rag_optimizer: RAGOptimizer = Depends(get_rag_optimizer),
) -> SemanticSearchService:
    """Dependency provider for SemanticSearchService (Task 53 / Task #3).

    Constructs ``VectorRetriever`` and ``LexicalRetriever`` inline and injects
    ``RAGOptimizer`` for hybrid search and reranking.
    """
    retriever = VectorRetriever(chroma_client=chroma_client, embedder=embedder)
    lexical_retriever = LexicalRetriever(chroma_client=chroma_client)
    return SemanticSearchService(
        retriever=retriever,
        lexical_retriever=lexical_retriever,
        rag_optimizer=rag_optimizer,
        settings=settings,
    )


def get_repository_chat_service(
    settings: Settings = Depends(get_settings_dep),
    chroma_client: VectorStoreClient = Depends(get_chroma_client),
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
    ``NemotronGateway``/``VectorStoreClient``/``RedisClient``, each already a
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
    chroma_client: VectorStoreClient = Depends(get_chroma_client),
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


def get_explain_service(
    settings: Settings = Depends(get_settings_dep),
    chroma_client: VectorStoreClient = Depends(get_chroma_client),
    embedder: NemotronEmbedder = Depends(get_embedder),
    llm_gateway: NemotronGateway = Depends(get_nemotron_gateway),
    rag_optimizer: RAGOptimizer = Depends(get_rag_optimizer),
) -> RepositoryExplainService:
    """Dependency provider for RepositoryExplainService (Task 93).

    Constructs ``VectorRetriever``, ``LexicalRetriever``,
    ``ContextBuilder``, ``PromptBuilder``, and ``CitationEngine`` inline --
    none hold a connection/resource worth caching; same reasoning as
    ``get_repository_chat_service`` (Task 54).
    """
    retriever = VectorRetriever(chroma_client=chroma_client, embedder=embedder)
    lexical_retriever = LexicalRetriever(chroma_client=chroma_client)
    context_builder = ContextBuilder(llm_gateway=llm_gateway)
    return RepositoryExplainService(
        retriever=retriever,
        lexical_retriever=lexical_retriever,
        rag_optimizer=rag_optimizer,
        context_builder=context_builder,
        prompt_builder=PromptBuilder(),
        llm_gateway=llm_gateway,
        citation_engine=CitationEngine(),
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


register_readiness_check(
    "qdrant" if get_settings().vector_store_backend == "qdrant" else "chromadb",
    _chroma_readiness_check,
)


async def _redis_readiness_check() -> bool:
    return await get_cache_client().health_check()


register_readiness_check("redis", _redis_readiness_check)
