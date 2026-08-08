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
from typing import Any

import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Side-effect import (Task 9): app.api.deps registers the ChromaDB
# readiness check into app.api.v1.health_routes's registry at module
# load time. Nothing below references `_deps` directly -- this import
# exists solely to guarantee that registration has happened before the
# first `/health/ready` request, without this file importing anything
# ChromaDB-specific itself (the registry pattern below is what future
# Tasks 10-12 extend the same way).
from app.api import deps as _deps  # noqa: F401
from app.api.v1 import api_router
from app.api.v1.health_routes import router as health_router
from app.config.logging_config import configure_logging
from app.config.settings import get_settings
from app.domain.enums import ErrorCategory
from app.domain.exceptions import SEISError
from app.domain.models import ErrorDetail, ErrorResponse

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
# Two distinct IDs:
#   correlation_id -- spans a whole logical operation. Reused from an
#     inbound `X-Correlation-Id` header when Express already generated
#     one (§11.1), so one operation traces across both services.
#   request_id      -- identifies exactly this HTTP call. Always minted
#     fresh, never taken from a header, so it can't be spoofed by a
#     caller and reliably distinguishes retries of the same
#     correlation_id from each other in the logs.
#
# Both live exclusively in structlog's own contextvars store
# (`structlog.contextvars`) rather than in a second, hand-rolled
# ContextVar -- one source of truth instead of two parallel mechanisms
# that have to be kept in sync. `get_correlation_id`/`get_request_id`
# read back from that same store for the (non-logging) call sites below
# that need the plain string value, e.g. to put in a JSON error body.
# -----------------------------------------------------------------------
def get_correlation_id() -> str:
    """Returns the correlation ID bound to the current execution context."""
    return str(structlog.contextvars.get_contextvars().get("correlation_id", "-"))


def get_request_id() -> str:
    """Returns the request ID bound to the current execution context."""
    return str(structlog.contextvars.get_contextvars().get("request_id", "-"))


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Assigns/propagates correlation + request IDs and logs request timing.

    Deliberately does NOT clear the bound context in a `finally` block.
    Starlette gives each incoming request its own asyncio Task, so there
    is no cross-request leakage risk to guard against -- and clearing
    early was an earlier, incorrect design (found and fixed via a
    pre-push review): it ran *before* the success-path log line below,
    and *before* Starlette's `ServerErrorMiddleware` -- which sits
    OUTSIDE this middleware and is what actually invokes the bare-
    ``Exception`` handler on an unhandled error -- ever got a chance to
    read it. Both the "request.completed" log line and every 500
    response's `correlationId` field were silently wrong as a result.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        # Defensive only (guards against any future change to task/context
        # reuse) -- not what makes this safe; per-request Task isolation is.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(correlation_id=correlation_id, request_id=request_id)

        start = time.perf_counter()
        logger.debug("request.received", method=request.method, path=request.url.path)
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            # WARNING, not `.exception()`: whichever handler ultimately
            # handles this (seis_error_handler / unhandled_exception_handler,
            # both below) logs the full exception + traceback exactly once.
            # Logging it here too would duplicate every failure in the logs
            # under two different event names.
            logger.warning(
                "request.failed",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
            )
            raise

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
# Four handlers, each registered for exactly one exception family:
#   - RequestValidationError    FastAPI/Pydantic request-shape errors
#   - StarletteHTTPException    explicit `raise HTTPException(...)` calls
#   - SEISError                 the domain exception hierarchy (Task 6,
#                                app.domain.exceptions) -- registering the
#                                *base* class is sufficient; Starlette
#                                resolves every subclass (BusinessError,
#                                RepositoryError, EmbeddingError, ...) to
#                                this same handler via MRO lookup, so no
#                                "global exception middleware" class is
#                                needed on top of this -- FastAPI's
#                                exception-handler registry already *is*
#                                that global mechanism.
#   - Exception (bare)          anything nobody anticipated -- the last
#                                line of defense, registered on Starlette's
#                                outermost ServerErrorMiddleware layer.
#
# Every handler builds its response via `_build_error_response` rather
# than relying on ObservabilityMiddleware to attach the correlation/
# request-ID headers afterward: the bare-`Exception` handler above runs
# on ServerErrorMiddleware, which sits OUTSIDE ObservabilityMiddleware,
# so a response built there never flows back through the middleware's
# post-`call_next` code at all (`call_next` raised, it didn't return) --
# there is no "afterward" for that path to attach a header in. Found via
# a pre-push review that hit exactly this case.
# -----------------------------------------------------------------------
def _build_error_response(
    status_code: int, code: str, message: str, *, details: dict[str, Any] | None = None
) -> JSONResponse:
    correlation_id = get_correlation_id()
    envelope = ErrorResponse(
        error=ErrorDetail(
            code=code, message=message, correlation_id=correlation_id, details=details
        )
    )
    response = JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", by_alias=True, exclude_none=True),
    )
    response.headers["X-Correlation-Id"] = correlation_id
    response.headers["X-Request-Id"] = get_request_id()
    return response


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.warning("request.validation_error", errors=exc.errors())
    return _build_error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Request validation failed."
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return _build_error_response(exc.status_code, f"HTTP_{exc.status_code}", str(exc.detail))


async def seis_error_handler(request: Request, exc: SEISError) -> JSONResponse:
    # Client-caused categories (a bad request, an unsupported repository)
    # are noise, not incidents -- WARNING. Everything else is our system
    # failing to do its job -- ERROR (§15.3 level guidance).
    log = (
        logger.warning
        if exc.category in (ErrorCategory.DOMAIN, ErrorCategory.VALIDATION)
        else logger.error
    )
    log(
        "request.domain_error",
        error_code=exc.code,
        category=exc.category.value,
        retryable=exc.retryable,
        details=exc.details,
    )
    return _build_error_response(
        exc.http_status, exc.code, exc.message, details=exc.details or None
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak stack traces or exception internals to the caller (§26
    # Security) -- full detail goes server-side only, via logger.exception.
    logger.exception("request.unhandled_error", path=request.url.path)
    return _build_error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred.",
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
    app.add_exception_handler(SEISError, seis_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    return app


app = create_app()
