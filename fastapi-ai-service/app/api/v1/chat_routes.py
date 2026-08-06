"""Repository chat endpoints.

Exposes the Repository Chat Orchestrator (§5.11) to Express. A repo
must be in the READY state (§22) to accept chat requests.
"""

from fastapi import APIRouter

# POST /repositories/{id}/chat, per the §11.2 contract.
router = APIRouter(prefix="/repositories", tags=["chat"])
