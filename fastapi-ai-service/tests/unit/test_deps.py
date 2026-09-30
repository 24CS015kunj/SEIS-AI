"""Unit tests for app/api/deps.py (Task 8 Dependency Injection)."""

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import SecretStr

from app.api import deps
from app.api.deps import (
    get_cache_client,
    get_chroma_client,
    get_correlation_id_dep,
    get_evaluation_service,
    get_evolution_analysis_service,
    get_job_manager,
    get_logger_dep,
    get_nemotron_gateway,
    get_repository_chat_service,
    get_repository_processing_service,
    get_semantic_search_service,
    get_settings_dep,
    verify_service_token,
)
from app.api.v1 import health_routes
from app.config.settings import Settings
from app.domain.exceptions import SEISAuthorizationError
from app.infra.cache.cache_client import RedisClient
from app.infra.llm.gemini_client import NemotronGateway
from app.infra.vectorstore.chroma_client import ChromaClient
from app.infra.vectorstore.qdrant_client import QdrantVectorClient
from app.services.evaluation_service import EvaluationService
from app.services.evolution_analysis_service import EvolutionAnalysisService
from app.services.repository_chat_service import RepositoryChatService
from app.services.repository_processing_service import RepositoryProcessingService
from app.services.semantic_search_service import SemanticSearchService


def test_get_settings_dep() -> None:
    settings = get_settings_dep()
    assert isinstance(settings, Settings)


def test_get_logger_dep() -> None:
    logger = get_logger_dep()
    assert logger is not None


def test_get_correlation_id_dep() -> None:
    correlation_id = get_correlation_id_dep()
    assert isinstance(correlation_id, str)


@pytest.mark.asyncio
async def test_verify_service_token_unconfigured() -> None:
    settings = Settings(internal_api_key=SecretStr(""))
    res = await verify_service_token(credentials=None, settings=settings)
    assert res == "development-unauthenticated"


@pytest.mark.asyncio
async def test_verify_service_token_success() -> None:
    settings = Settings(internal_api_key=SecretStr("supersecret"))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="supersecret")
    token = await verify_service_token(credentials=creds, settings=settings)
    assert token == "supersecret"


@pytest.mark.asyncio
async def test_verify_service_token_missing() -> None:
    settings = Settings(internal_api_key=SecretStr("supersecret"))
    with pytest.raises(SEISAuthorizationError) as exc_info:
        await verify_service_token(credentials=None, settings=settings)
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.http_status == 401


@pytest.mark.asyncio
async def test_verify_service_token_mismatch() -> None:
    settings = Settings(internal_api_key=SecretStr("supersecret"))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrongsecret")
    with pytest.raises(SEISAuthorizationError) as exc_info:
        await verify_service_token(credentials=creds, settings=settings)
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.http_status == 401


def test_service_dependency_providers() -> None:
    settings = get_settings_dep()

    proc_svc = get_repository_processing_service(settings=settings)
    assert isinstance(proc_svc, RepositoryProcessingService)

    search_svc = get_semantic_search_service(settings=settings)
    assert isinstance(search_svc, SemanticSearchService)

    chat_svc = get_repository_chat_service(settings=settings)
    assert isinstance(chat_svc, RepositoryChatService)

    evo_svc = get_evolution_analysis_service(settings=settings)
    assert isinstance(evo_svc, EvolutionAnalysisService)

    eval_svc = get_evaluation_service(settings=settings)
    assert isinstance(eval_svc, EvaluationService)


@pytest.mark.parametrize(
    "backend, adapter", [("chroma", ChromaClient), ("qdrant", QdrantVectorClient)]
)
def test_vector_provider_selects_configured_adapter(monkeypatch, backend, adapter) -> None:
    settings = Settings(_env_file=None, vector_store_backend=backend)
    monkeypatch.setattr(deps, "get_settings", lambda: settings)
    get_chroma_client.cache_clear()
    try:
        client = get_chroma_client()
        assert isinstance(client, adapter)
        assert get_chroma_client() is client
    finally:
        get_chroma_client.cache_clear()


def test_vector_readiness_check_registered_on_import() -> None:
    name = "qdrant" if get_settings_dep().vector_store_backend == "qdrant" else "chromadb"
    assert name in health_routes._readiness_checks


@pytest.mark.asyncio
async def test_vector_readiness_reports_unavailable_without_external_calls(monkeypatch) -> None:
    class UnavailableStore:
        async def health_check(self) -> bool:
            return False

    monkeypatch.setattr(deps, "get_chroma_client", lambda: UnavailableStore())
    assert await deps._chroma_readiness_check() is False


def test_get_cache_client_returns_redis_client_instance() -> None:
    client = get_cache_client()
    assert isinstance(client, RedisClient)


def test_get_cache_client_is_a_process_lifetime_singleton() -> None:
    """`lru_cache` must yield the same instance across calls (Task 10 §Client Lifetime) --
    a new Redis connection pool per request/operation would defeat pooling entirely."""
    first = get_cache_client()
    second = get_cache_client()
    assert first is second


def test_redis_readiness_check_registered_on_import() -> None:
    """Importing app.api.deps must register a "redis" readiness check
    (Task 10 §Readiness) -- otherwise `/health/ready` never reflects Redis
    connectivity, silently defeating the readiness-integration requirement."""
    assert "redis" in health_routes._readiness_checks


@pytest.mark.asyncio
async def test_redis_readiness_check_never_raises() -> None:
    """Whether or not a real Redis server happens to be reachable in the
    environment running this suite, the registered check must degrade to a
    plain bool, never propagate an exception into the readiness endpoint."""
    check = health_routes._readiness_checks["redis"]
    result = await check()
    assert isinstance(result, bool)


def test_get_job_manager_returns_job_manager_instance() -> None:
    from app.services.job_manager import IngestionJobManager

    manager = get_job_manager()
    assert isinstance(manager, IngestionJobManager)


def test_get_job_manager_returns_the_process_singleton() -> None:
    first = get_job_manager()
    second = get_job_manager()
    assert first is second


def test_get_nemotron_gateway_returns_nemotron_gateway_instance() -> None:
    gateway = get_nemotron_gateway()
    assert isinstance(gateway, NemotronGateway)


def test_get_nemotron_gateway_is_a_process_lifetime_singleton() -> None:
    """`lru_cache` must yield the same instance across calls (Task 12 §Client Lifetime) --
    a new httpx.AsyncClient per request/operation would defeat the point of a shared gateway."""
    first = get_nemotron_gateway()
    second = get_nemotron_gateway()
    assert first is second
