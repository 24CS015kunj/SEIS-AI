"""Application entry point.

Hosts the FastAPI application factory: lifespan (startup/shutdown)
hooks, versioned router registration, middleware, and exception
handlers, per docs/week1-ai-system-design.md §3.1 (Architectural
Style) and §9 (Base Infrastructure).

Application identity and log level are sourced from
``app.config.settings.Settings`` (Task 4) via the process-wide
:func:`get_settings` singleton -- read once at import time, since app
construction happens once per process. Logging is configured by
``app.config.logging_config.configure_logging`` (Task 5); every
``logger`` in this module is a ``structlog`` bound logger.
"""

import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any

import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.api.v1 import api_router
from app.api.v1.health_routes import router as health_router
from app.config.logging_config import configure_logging
from app.config.settings import get_settings

# API path versioning is a routing/architecture decision (§3.1), not a
# runtime config knob -- unlike everything in Settings, it is not meant
# to differ across environments, so it stays a code constant.
API_V1_PREFIX = "/api/v1"

settings = get_settings()
configure_logging(settings)
logger = structlog.get_logger("seis.app")


# -----------------------------------------------------------------------
# Correlation ID / Request ID propagation (§15 Logging Strategy, §21.8).
#
# Two distinct IDs, both stored in ContextVars rather than only on
# `request.state` so that framework-agnostic Core Pipeline code (§3.1) --
# which by design never receives a Request object -- can still read them:
#
#   correlation_id -- spans a whole logical operation. Reused from an
#     inbound `X-Correlation-Id` header when Express already generated
#     one (§11.1), so one operation traces across both services.
#   request_id      -- identifies exactly this HTTP call. Always minted
#     fresh, never taken from a header, so it can't be spoofed by a
#     caller and reliably distinguishes retries of the same
#     correlation_id from each other in the logs.
#
# Also bound into structlog's contextvars (`bind_contextvars`) so every
# `structlog.get_logger()` call anywhere in the app -- not just this
# middleware -- automatically includes both fields without threading a
# Request object through service/core-layer code.
# -----------------------------------------------------------------------
_correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")
_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


def get_correlation_id() -> str:
    """Returns the correlation ID bound to the current execution context."""
    return _correlation_id_ctx.get()


def get_request_id() -> str:
    """Returns the request ID bound to the current execution context."""
    return _request_id_ctx.get()


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Assigns/propagates correlation + request IDs and logs request timing.

    Structured (JSON in non-development environments, per Task 5) logging
    replaces the plain-stdlib calls used through Task 4. Externally
    observable behavior grows by exactly one additive response header
    (``X-Request-Id``, alongside the existing ``X-Correlation-Id``) --
    status codes and every existing header are unchanged.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        correlation_token = _correlation_id_ctx.set(correlation_id)
        request_token = _request_id_ctx.set(request_id)
        structlog.contextvars.bind_contextvars(correlation_id=correlation_id, request_id=request_id)

        start = time.perf_counter()
        logger.debug("request.received", method=request.method, path=request.url.path)
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.exception(
                "request.failed",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
            )
            raise
        finally:
            _correlation_id_ctx.reset(correlation_token)
            _request_id_ctx.reset(request_token)
            structlog.contextvars.clear_contextvars()

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "request.completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        response.headers["X-Correlation-Id"] = correlation_id
        response.headers["X-Request-Id"] = request_id
        return response


# -----------------------------------------------------------------------
# Startup / shutdown lifecycle (§9 Base Infrastructure).
#
# Registries (rather than hardcoded calls in `lifespan`) so Tasks 10-12
# each register their own connection/warm-up and teardown hook from their
# own module -- this file is not edited again as new infrastructure
# clients are added.
# -----------------------------------------------------------------------
_startup_hooks: list[Callable[[], Awaitable[None]]] = []
_shutdown_hooks: list[Callable[[], Awaitable[None]]] = []


def register_startup_hook(hook: Callable[[], Awaitable[None]]) -> None:
    """Registers an async callable to run once, during application startup."""
    _startup_hooks.append(hook)


def register_shutdown_hook(hook: Callable[[], Awaitable[None]]) -> None:
    """Registers an async callable to run once, during graceful shutdown."""
    _shutdown_hooks.append(hook)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "startup.begin",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.service_env.value,
    )
    for hook in _startup_hooks:
        await hook()
    logger.info("startup.complete", hooks_run=len(_startup_hooks))

    try:
        yield
    finally:
        logger.info("shutdown.begin")
        # Reverse order: the last dependency started is the first torn down.
        for hook in reversed(_shutdown_hooks):
            await hook()
        logger.info("shutdown.complete")


# -----------------------------------------------------------------------
# Exception handling (§14 Error Handling Strategy).
#
# Foundational, transport-level handlers only. Task 6 adds handlers for
# the domain exception hierarchy (Business/Validation/Repository/
# Embedding/VectorDB/LLM) on top of this without replacing it -- these
# three remain the last line of defense for anything domain handlers
# don't catch.
# -----------------------------------------------------------------------
def _error_envelope(code: str, message: str, correlation_id: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "correlationId": correlation_id}}


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    correlation_id = get_correlation_id()
    logger.warning("request.validation_error", errors=exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_envelope("VALIDATION_ERROR", "Request validation failed.", correlation_id),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    correlation_id = get_correlation_id()
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_envelope(f"HTTP_{exc.status_code}", str(exc.detail), correlation_id),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak stack traces or exception internals to the caller (§26
    # Security) -- full detail goes server-side only, via logger.exception.
    correlation_id = get_correlation_id()
    logger.exception("request.unhandled_error", path=request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_envelope(
            "INTERNAL_SERVER_ERROR", "An unexpected error occurred.", correlation_id
        ),
    )


def create_app() -> FastAPI:
    """Builds and configures the FastAPI application instance.

    A factory -- rather than a bare module-level ``app = FastAPI()`` --
    so tests (Task 13) can construct independent, isolated app instances
    with dependency overrides instead of sharing global state across
    the test session.
    """
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    app.add_middleware(ObservabilityMiddleware)
    # No CORS middleware: FastAPI is never called from a browser (§11.1 --
    # only Express calls this service), so there is no cross-origin
    # surface to configure. Adding one here would be attack surface with
    # no corresponding requirement.

    # Health/readiness/liveness are operational endpoints consumed by the
    # container orchestrator and Docker health checks (Task 14), not by
    # Express as a business API -- mounted unversioned at the root rather
    # than under API_V1_PREFIX.
    app.include_router(health_router)
    app.include_router(api_router, prefix=API_V1_PREFIX)

    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app


app = create_app()
