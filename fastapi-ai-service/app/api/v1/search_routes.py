"""Semantic search endpoints.

Exposes the Semantic Search Service (§5.12) — retrieval without
generation, cheaper and faster than the chat path.
"""

from fastapi import APIRouter

# POST /repositories/{id}/search, per the §11.2 contract.
router = APIRouter(prefix="/repositories", tags=["search"])
