"""Version 1 API routes (§11.2 API Contract Summary).

Assembles the versioned business-API sub-routers into a single
``api_router``, mounted by ``app.main.create_app`` under
``API_V1_PREFIX``. Health/readiness/liveness are intentionally excluded
here -- they mount unversioned at the service root (see
``app.api.v1.health_routes``).

A future v2 (a breaking change to an existing endpoint's contract)
adds a sibling ``app/api/v2/`` package and its own aggregator here,
without touching v1's routers.
"""

from fastapi import APIRouter

from app.api.v1.analysis_routes import router as analysis_router
from app.api.v1.chat_routes import router as chat_router
from app.api.v1.ingest_routes import router as ingest_router
from app.api.v1.search_routes import router as search_router

api_router = APIRouter()
api_router.include_router(ingest_router)
api_router.include_router(chat_router)
api_router.include_router(analysis_router)
api_router.include_router(search_router)
