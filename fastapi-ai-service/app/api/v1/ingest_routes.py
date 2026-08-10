"""Repository ingestion endpoints.

Entry point Express calls to trigger the Repository Processing Engine
(§6.1 Trigger Contract, §11.2). Accepts and returns immediately
(202 Accepted); processing runs asynchronously (§3.2 Execution Model).
"""

from fastapi import APIRouter

# Prefix matches the §11.2 contract: POST /repositories/{id}/ingest and
# POST /repositories/{id}/reindex both live under this router once the
# Repository Processing Engine (Week 3) adds the endpoint functions.
router = APIRouter(prefix="/repositories", tags=["ingestion"])
