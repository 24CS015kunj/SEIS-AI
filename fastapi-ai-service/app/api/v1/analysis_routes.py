"""Software evolution analysis endpoints.

Exposes evolution reports produced by the Software Evolution Analysis
Engine (§5.2, §7) for consumption by Express/React dashboards.
"""

from fastapi import APIRouter

# GET /repositories/{id}/evolution, per the §11.2 contract.
router = APIRouter(prefix="/repositories", tags=["evolution-analysis"])
