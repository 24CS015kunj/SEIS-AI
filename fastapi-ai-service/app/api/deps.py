"""Shared FastAPI dependencies.

Provides the service-to-service auth guard (§26.1-§26.2) and injected
access to settings, the structured logger, and infrastructure clients
(ChromaDB, Gemini) used across route handlers (§8 Dependency
Injection).
"""

from functools import lru_cache
from typing import cast

import structlog
from celery import Celery  # type: ignore[import-untyped]
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.v1.health_routes import register_readiness_check
from app.config.settings import Settings, get_settings
from app.domain.exceptions import SEISAuthorizationError
from app.infra.cache.cache_client import RedisClient
from app.infra.llm.gemini_client import GeminiGateway
from app.infra.queue.task_queue import celery_app
from app.infra.vectorstore.chroma_client import ChromaClient
from app.services.evaluation_service import EvaluationService
from app.services.evolution_analysis_service import EvolutionAnalysisService
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
def get_repository_processing_service(
    settings: Settings = Depends(get_settings_dep),
) -> RepositoryProcessingService:
    """Dependency provider for RepositoryProcessingService.

    Constructor Design Evolution:
    Service constructors are minimal during Task 8 (accepting Settings) and designed
    to evolve via constructor dependency injection as infrastructure adapters
    (ChromaClient, QueueClient, Logger) become available in Tasks 9-12 without
    requiring route signature changes.
    """
    return RepositoryProcessingService(settings=settings)


def get_semantic_search_service(
    settings: Settings = Depends(get_settings_dep),
) -> SemanticSearchService:
    """Dependency provider for SemanticSearchService.

    Constructor Design Evolution:
    Will evolve to accept ChromaClient and Logger via constructor injection
    in Tasks 9-12 without modifying API route signatures.
    """
    return SemanticSearchService(settings=settings)


def get_repository_chat_service(
    settings: Settings = Depends(get_settings_dep),
) -> RepositoryChatService:
    """Dependency provider for RepositoryChatService.

    Constructor Design Evolution:
    Will evolve to accept ChromaClient, GeminiGateway, and CacheClient via
    constructor injection in Tasks 9-12 without modifying API route signatures.
    """
    return RepositoryChatService(settings=settings)


def get_evolution_analysis_service(
    settings: Settings = Depends(get_settings_dep),
) -> EvolutionAnalysisService:
    """Dependency provider for EvolutionAnalysisService.

    Constructor Design Evolution:
    Will evolve to accept ChromaClient and Logger via constructor injection
    in Tasks 9-12 without modifying API route signatures.
    """
    return EvolutionAnalysisService(settings=settings)


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


async def _chroma_readiness_check() -> bool:
    return await get_chroma_client().health_check()


# Registered at import time (Task 9) so `/health/ready` reflects real
# ChromaDB connectivity as soon as this module loads -- see the
# side-effect import in app.main for why that import exists.
register_readiness_check("chromadb", _chroma_readiness_check)


@lru_cache(maxsize=1)
def get_cache_client() -> RedisClient:
    """FastAPI dependency provider for the process-wide Redis cache adapter (Task 10).

    Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_chroma_client` (Task 9) -- one ``RedisClient`` per
    process, constructed lazily on first real use, never rebuilt per
    request or per cache operation.
    """
    return RedisClient(settings=get_settings())


async def _redis_readiness_check() -> bool:
    return await get_cache_client().health_check()


# Registered at import time (Task 10), same rationale as the ChromaDB
# check above: `/health/ready` must reflect real Redis connectivity as
# soon as this module loads.
register_readiness_check("redis", _redis_readiness_check)


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
def get_gemini_gateway() -> GeminiGateway:
    """FastAPI dependency provider for the process-wide Gemini gateway (Task 12).

    Same ``lru_cache`` process-lifetime singleton pattern as
    :func:`get_chroma_client`/:func:`get_cache_client` -- one
    ``GeminiGateway`` per process, constructed lazily (the underlying
    ``genai.Client`` is built on first real call inside
    ``GeminiGateway``, not here, so a missing ``GEMINI_API_KEY`` never
    prevents the process from starting).
    """
    return GeminiGateway(settings=get_settings())
