"""Request/response DTOs for the repository explanation API (Task 93).

Two task types are exposed via one route:

* ``code_explanation`` -- grounded explanation of a specific repository
  file (activates ``TaskType.CODE_EXPLANATION``).
* ``architecture_summary`` -- repository-wide architectural overview
  (activates ``TaskType.ARCHITECTURE_SUMMARY``).

``file_path`` is optional at the schema level because
``architecture_summary`` operates repository-wide and needs no specific
file.  ``explain_routes.py`` raises ``DomainValidationError`` when
``task_type == code_explanation`` and ``file_path`` is absent -- that
validation belongs in the route (it requires business-level context),
not here (Pydantic's job is shape, not cross-field business rules).

``repository_id`` is not a field here -- it comes exclusively from the
URL path, the same convention every other schema in this package already
follows (``chat_schema.py``, ``analysis_schema.py``, etc.).

The response reuses ``app.domain.models.Citation`` directly for
citations (same shape as ``ChatResponse``), and returns ``task_type``
echoed back so the caller can distinguish which flow produced the
response without inspecting the answer text.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import TaskType
from app.domain.models import Citation


class ExplainRequest(BaseModel):
    """Request body for ``POST /repositories/{repository_id}/explain``."""

    model_config = ConfigDict(extra="forbid")

    task_type: TaskType = Field(
        description=(
            "Explanation task: 'code_explanation' for a specific file, "
            "'architecture_summary' for the whole repository."
        ),
    )
    file_path: str | None = Field(
        default=None,
        min_length=1,
        max_length=1024,
        description=(
            "Repository-relative path to explain (e.g. 'backend/maze.py'). "
            "Required when task_type is 'code_explanation'; ignored for "
            "'architecture_summary'."
        ),
    )


class ExplainResponse(BaseModel):
    """Response body for ``POST /repositories/{repository_id}/explain``."""

    model_config = ConfigDict(extra="forbid")

    task_type: TaskType = Field(description="The task type that was executed.")
    file_path: str | None = Field(
        default=None,
        description="The file that was explained (null for architecture_summary).",
    )
    answer: str = Field(description="AI-generated grounded explanation.")
    citations: list[Citation] = Field(
        default_factory=list,
        description="Source citations extracted from the answer.",
    )
