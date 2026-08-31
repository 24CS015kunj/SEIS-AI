"""Request DTO for the semantic search API (§11.2, §5.12).

``repository_id`` has no field here at all -- it comes exclusively
from the URL path (``POST /repositories/{repository_id}/search``),
same convention ``IngestRequest`` already established. The response
reuses ``app.domain.models.SearchResponse`` directly (Task 53): its
shape (``repository_id``, ``query``, ``results``) already matches what
this endpoint returns, so no separate response DTO is defined here.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SearchRequest(BaseModel):
    """Request body for ``POST /repositories/{repository_id}/search``."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=2000, description="Natural-language search query.")
