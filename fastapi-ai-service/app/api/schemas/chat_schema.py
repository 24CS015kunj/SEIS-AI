"""Request DTO for the repository chat API (§11.2, §5.11).

``repository_id`` has no field here at all -- it comes exclusively
from the URL path, same convention ``IngestRequest``/``SearchRequest``
already established. ``conversation_id`` is required, matching the
frozen ``app.domain.models.ChatRequest`` contract exactly (Task 54):
no conversation-history persistence mechanism exists yet anywhere in
this codebase, so this identifier is accepted and passed through
unchanged -- never generated, substituted, or looked up here. The
response reuses ``app.domain.models.ChatResponse`` directly, same as
Task 53's ``SearchResponse`` reuse: no separate response DTO is
defined here.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageRequest(BaseModel):
    """Request body for ``POST /repositories/{repository_id}/chat``."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(
        min_length=1, max_length=8000, description="The user's question about the repository."
    )
    conversation_id: str = Field(
        min_length=1, description="Caller-supplied conversation identifier."
    )
