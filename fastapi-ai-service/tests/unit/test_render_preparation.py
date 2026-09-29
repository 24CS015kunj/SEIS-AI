"""Unit tests for FastAPI Render Preparation (Task T4).

Verifies:
1. Port precedence resolution logic (PORT > SERVICE_PORT > 8000 default).
2. Production settings validation: required secrets in production, legacy fallback,
   and development pass-through.
3. Health probe contracts: /health, /health/live, /health/ready (200 vs 503).
4. Service authentication guard (verify_service_token) with missing, invalid, and valid tokens.
"""

import asyncio
import time
from unittest.mock import AsyncMock

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.api.deps import verify_service_token
from app.api.v1 import health_routes
from app.config.settings import Environment, Settings
from app.domain.exceptions import SEISAuthorizationError
from app.main import create_app


def resolve_runtime_port(env_vars: dict[str, str]) -> int:
    """Simulates the container startup shell expansion: ${PORT:-${SERVICE_PORT:-8000}}."""
    port_str = env_vars.get("PORT") or env_vars.get("SERVICE_PORT") or "8000"
    return int(port_str)


class TestPortPrecedence:
    """Tests runtime port resolution precedence."""

    def test_prefers_platform_port_when_both_set(self) -> None:
        env = {"PORT": "10000", "SERVICE_PORT": "9000"}
        assert resolve_runtime_port(env) == 10000

    def test_falls_back_to_service_port_when_port_unset(self) -> None:
        env = {"SERVICE_PORT": "9000"}
        assert resolve_runtime_port(env) == 9000

    def test_falls_back_to_default_8000_when_both_unset(self) -> None:
        env: dict[str, str] = {}
        assert resolve_runtime_port(env) == 8000

    def test_handles_empty_string_port_by_falling_back(self) -> None:
        env = {"PORT": "", "SERVICE_PORT": "9000"}
        assert resolve_runtime_port(env) == 9000


class TestProductionSettingsValidation:
    """Tests production environment validation and secrets enforcement."""

    def test_development_allows_blank_secrets(self) -> None:
        settings = Settings(
            service_env=Environment.DEVELOPMENT,
            internal_api_key=SecretStr(""),
            nvidia_embedding_api_key=SecretStr(""),
            nvidia_chat_api_key=SecretStr(""),
        )
        assert settings.is_production is False
        assert settings.internal_api_key.get_secret_value() == ""

    def test_production_fails_when_all_secrets_missing(self) -> None:
        pattern = r"Missing required secret\(s\) for SERVICE_ENV=production"
        with pytest.raises(ValueError, match=pattern):
            Settings(
                service_env=Environment.PRODUCTION,
                internal_api_key=SecretStr(""),
                nvidia_embedding_api_key=SecretStr(""),
                nvidia_chat_api_key=SecretStr(""),
                nvidia_api_key=SecretStr(""),
            )

    def test_production_fails_when_single_secret_missing(self) -> None:
        with pytest.raises(ValueError, match="INTERNAL_API_KEY"):
            Settings(
                service_env=Environment.PRODUCTION,
                internal_api_key=SecretStr(""),
                nvidia_embedding_api_key=SecretStr("nv-embed-key"),
                nvidia_chat_api_key=SecretStr("nv-chat-key"),
            )

    def test_production_succeeds_with_all_required_secrets(self) -> None:
        settings = Settings(
            service_env=Environment.PRODUCTION,
            internal_api_key=SecretStr("internal-secret-123"),
            redis_url="rediss://:fixture-password@example.invalid:6379/0",
            nvidia_embedding_api_key=SecretStr("nv-embed-secret-123"),
            nvidia_chat_api_key=SecretStr("nv-chat-secret-123"),
        )
        assert settings.is_production is True
        assert settings.internal_api_key.get_secret_value() == "internal-secret-123"

    def test_legacy_nvidia_api_key_populates_specific_keys(self) -> None:
        settings = Settings(
            service_env=Environment.PRODUCTION,
            internal_api_key=SecretStr("internal-secret-123"),
            nvidia_embedding_api_key=SecretStr(""),
            redis_url="rediss://:fixture-password@example.invalid:6379/0",
            nvidia_chat_api_key=SecretStr(""),
            nvidia_api_key=SecretStr("legacy-nvidia-key"),
        )
        assert settings.nvidia_embedding_api_key.get_secret_value() == "legacy-nvidia-key"
        assert settings.nvidia_chat_api_key.get_secret_value() == "legacy-nvidia-key"


class TestManagedRedisConfiguration:
    def test_canonical_url_wins_and_credentials_are_hidden(self) -> None:
        settings = Settings(
            _env_file=None,
            redis_url="rediss://:fixture-password@example.invalid:6379/0",
            task_queue_broker_url="redis://localhost:6379/2",
        )
        assert settings.redis_url == settings.task_queue_broker_url
        assert settings.redis_url.startswith("rediss://")
        assert "fixture-password" not in repr(settings)
        assert "redis_url" not in settings.model_dump()
        assert "task_queue_broker_url" not in settings.model_dump()

    @pytest.mark.parametrize(
        "url",
        [
            "https://example.invalid",
            "rediss://:fixture-password@example.invalid?ssl_cert_reqs=none",
            "redis://localhost:99999/0",
            "redis://localhost/not-a-db",
        ],
    )
    def test_invalid_url_has_a_sanitized_error(self, url: str) -> None:
        with pytest.raises(ValueError) as exc:
            Settings(_env_file=None, redis_url=url)
        assert "fixture-password" not in str(exc.value)
        assert "REDIS_URL" in str(exc.value)

    @pytest.mark.parametrize("url", ["", "redis://localhost:6379/0", "rediss://example.invalid/0"])
    def test_production_rejects_missing_or_insecure_redis(self, url: str) -> None:
        with pytest.raises(ValueError, match="authenticated rediss"):
            Settings(
                _env_file=None,
                service_env=Environment.PRODUCTION,
                internal_api_key=SecretStr("fixture"),
                nvidia_api_key=SecretStr("fixture"),
                redis_url=url,
                task_queue_broker_url="",
            )

    def test_local_fallback_and_legacy_alias(self) -> None:
        assert Settings(_env_file=None, redis_url="", task_queue_broker_url="").redis_url == (
            "redis://localhost:6379/0"
        )
        settings = Settings(
            _env_file=None, redis_url="", task_queue_broker_url="redis://redis:6379/1"
        )
        assert settings.redis_url == "redis://redis:6379/1"


class TestServiceAuthenticationGuard:
    """Tests verify_service_token dependency guard."""

    @pytest.mark.asyncio
    async def test_passes_through_when_internal_api_key_unset(self) -> None:
        settings = Settings(internal_api_key=SecretStr(""))
        res = await verify_service_token(credentials=None, settings=settings)
        assert res == "development-unauthenticated"

    @pytest.mark.asyncio
    async def test_rejects_missing_credentials_when_key_set(self) -> None:
        settings = Settings(internal_api_key=SecretStr("production-token-secret"))
        with pytest.raises(SEISAuthorizationError) as exc:
            await verify_service_token(credentials=None, settings=settings)
        assert "Missing or malformed Authorization header" in exc.value.message

    @pytest.mark.asyncio
    async def test_rejects_non_bearer_scheme(self) -> None:
        settings = Settings(internal_api_key=SecretStr("production-token-secret"))
        creds = HTTPAuthorizationCredentials(scheme="Basic", credentials="production-token-secret")
        with pytest.raises(SEISAuthorizationError) as exc:
            await verify_service_token(credentials=creds, settings=settings)
        assert "Expected Bearer token" in exc.value.message

    @pytest.mark.asyncio
    async def test_rejects_mismatched_token(self) -> None:
        settings = Settings(internal_api_key=SecretStr("production-token-secret"))
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong-token")
        with pytest.raises(SEISAuthorizationError) as exc:
            await verify_service_token(credentials=creds, settings=settings)
        assert "Invalid service authentication token" in exc.value.message

    @pytest.mark.asyncio
    async def test_accepts_valid_bearer_token(self) -> None:
        settings = Settings(internal_api_key=SecretStr("production-token-secret"))
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="production-token-secret")
        res = await verify_service_token(credentials=creds, settings=settings)
        assert res == "production-token-secret"


class TestHealthAndReadinessEndpoints:
    """Tests operational /health, /health/live, /health/ready endpoints."""

    @pytest.fixture
    def app_client(self):
        app = create_app()
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://testserver")

    @pytest.mark.asyncio
    async def test_health_identity_endpoint(self, app_client: AsyncClient) -> None:
        async with app_client as client:
            res = await client.get("/health")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "ok"
            assert "service" in data
            assert "version" in data

    @pytest.mark.asyncio
    async def test_health_live_endpoint(self, app_client: AsyncClient) -> None:
        async with app_client as client:
            res = await client.get("/health/live", headers={"X-Correlation-Id": "test-live-probe"})
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "alive"
            assert isinstance(data["uptime_seconds"], int | float)
            assert res.headers.get("X-Correlation-Id") == "test-live-probe"

    @pytest.mark.asyncio
    async def test_health_ready_healthy_when_checks_pass(self, app_client: AsyncClient) -> None:
        original_checks = dict(health_routes._readiness_checks)
        health_routes._readiness_checks.clear()
        health_routes.register_readiness_check("chromadb", AsyncMock(return_value=True))
        health_routes.register_readiness_check("redis", AsyncMock(return_value=True))

        try:
            async with app_client as client:
                res = await client.get("/health/ready")
                assert res.status_code == 200
                data = res.json()
                assert data["status"] == "ready"
                deps = {d["name"]: d["healthy"] for d in data["dependencies"]}
                assert deps.get("chromadb") is True
                assert deps.get("redis") is True
        finally:
            health_routes._readiness_checks.clear()
            health_routes._readiness_checks.update(original_checks)

    @pytest.mark.asyncio
    async def test_health_ready_unhealthy_when_dependency_fails(
        self, app_client: AsyncClient
    ) -> None:
        original_checks = dict(health_routes._readiness_checks)
        health_routes._readiness_checks.clear()
        health_routes.register_readiness_check("chromadb", AsyncMock(return_value=False))
        health_routes.register_readiness_check("redis", AsyncMock(return_value=True))

        try:
            async with app_client as client:
                res = await client.get("/health/ready")
                assert res.status_code == 503
                data = res.json()
                assert data["status"] == "not_ready"
                deps = {d["name"]: d["healthy"] for d in data["dependencies"]}
                assert deps.get("chromadb") is False
                assert deps.get("redis") is True
        finally:
            health_routes._readiness_checks.clear()
            health_routes._readiness_checks.update(original_checks)

    async def test_readiness_bounds_multiple_stalled_dependencies(
        self,
        app_client: AsyncClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def stalled() -> bool:
            await asyncio.sleep(20)
            return True

        monkeypatch.setattr(
            health_routes,
            "_readiness_checks",
            {
                "chromadb": stalled,
                "redis": stalled,
            },
        )
        start = time.perf_counter()
        async with app_client as client:
            res = await client.get("/health/ready")
            assert res.status_code == 503
            assert all(not dependency["healthy"] for dependency in res.json()["dependencies"])
            assert (await client.get("/health/live")).status_code == 200
        assert time.perf_counter() - start < 2.8
