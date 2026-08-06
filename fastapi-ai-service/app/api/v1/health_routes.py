"""Health, readiness, and liveness endpoints.

Base infrastructure routes used by orchestration platforms and by
Express to determine service availability (§9 Base Infrastructure,
§27 Production Readiness Checklist).

Mounted unversioned at the service root by ``app.main.create_app`` --
these are operational endpoints for the container orchestrator and
Docker health checks (Task 14), not a business API consumed by Express,
so they deliberately sit outside ``API_V1_PREFIX``.
"""

import time
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.config.settings import get_settings

router = APIRouter(tags=["health"])

_service_start_time = time.monotonic()

ReadinessCheck = Callable[[], Awaitable[bool]]
_readiness_checks: dict[str, ReadinessCheck] = {}


def register_readiness_check(name: str, check: ReadinessCheck) -> None:
    """Registers a named async dependency check for ``/health/ready``.

    Called by infrastructure modules as they come online -- Task 10's
    ChromaDB client, Task 11's Gemini gateway -- so this file is not
    edited again every time a new dependency joins the readiness
    contract.
    """
    _readiness_checks[name] = check


class HealthResponse(BaseModel):
    service: str
    version: str
    status: str


class LivenessResponse(BaseModel):
    status: str
    uptime_seconds: float


class DependencyStatus(BaseModel):
    name: str
    healthy: bool


class ReadinessResponse(BaseModel):
    status: str
    dependencies: list[DependencyStatus]


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Lightweight status endpoint -- process identity, no dependency checks."""
    settings = get_settings()
    return HealthResponse(service=settings.app_name, version=settings.app_version, status="ok")


@router.get("/health/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Liveness probe: is the process running and able to respond at all.

    Deliberately checks nothing beyond that -- a liveness probe that
    depends on ChromaDB/Gemini would cause the orchestrator to restart a
    perfectly healthy process during a transient dependency outage,
    which is exactly the readiness probe's job instead.
    """
    return LivenessResponse(
        status="alive", uptime_seconds=round(time.monotonic() - _service_start_time, 2)
    )


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness(response: Response) -> ReadinessResponse:
    """Readiness probe: is the service able to accept and serve traffic.

    Evaluates every check registered via :func:`register_readiness_check`.
    No checks are registered until Tasks 10-11 add ChromaDB/Gemini
    connectivity checks, so today this always reports ready with an
    empty dependency list -- correct behavior for infrastructure that
    genuinely has no external dependencies wired up yet.
    """
    dependency_statuses: list[DependencyStatus] = []
    all_healthy = True

    for name, check in _readiness_checks.items():
        try:
            healthy = await check()
        except Exception:
            # A failing/erroring dependency check must never crash the
            # probe itself -- it must be reported as an unhealthy
            # dependency (§14 Error Handling Strategy).
            healthy = False
        dependency_statuses.append(DependencyStatus(name=name, healthy=healthy))
        all_healthy = all_healthy and healthy

    response.status_code = (
        status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return ReadinessResponse(
        status="ready" if all_healthy else "not_ready",
        dependencies=dependency_statuses,
    )
