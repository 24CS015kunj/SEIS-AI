"""Request/response DTOs for the ingestion API (§11.2, §6.1).

Deliberately distinct from ``app.domain.models.RepositoryManifest``/
``ManifestFile`` (see that module's own docstring on why): this is the
wire format Express will send, which the route handler adapts into the
frozen domain models Task 30's service actually consumes. Two
divergences from the domain shape, both intentional:

- ``repository_id`` has no field here at all -- it comes exclusively
  from the URL path (``POST /repositories/{repository_id}/ingest``),
  so there is nothing for it to disagree with. ``extra="forbid"``
  below means a caller that mistakenly includes it in the body gets an
  explicit 422 instead of the value being silently ignored.
- ``content`` is ``str | None`` here, not ``bytes | None``: JSON has
  no native byte-string type, and the deeper pipeline's own
  ``Document.content`` (Task 13) is ``str`` too. The route handler
  encodes to UTF-8 when constructing ``ManifestFile``, once, in one
  place, rather than leaning on Pydantic's implicit str->bytes JSON
  coercion.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ProcessingStatus


class IngestFileEntry(BaseModel):
    """One file within an ingestion request body -- the wire-format
    counterpart of :class:`app.domain.models.ManifestFile`.

    ``content`` is optional and omitted (not empty-string) for files
    Express did not inline (oversized/binary originals) -- same
    "``None`` means genuinely absent" convention the domain model
    itself already uses.
    """

    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1, description="Repository-relative file path.")
    content: str | None = Field(
        default=None, description="UTF-8 file content, omitted for skipped files."
    )
    language: str | None = Field(default=None, description="Detected language, if known.")
    size_bytes: int = Field(ge=0, description="File size in bytes.")


class IngestRequest(BaseModel):
    """Request body for ``POST /repositories/{repository_id}/ingest``.

    ``repository_id`` is intentionally absent -- see module docstring.
    ``files`` may legitimately be empty: neither
    :class:`app.domain.models.RepositoryManifest` nor ``ManifestFile``
    impose a minimum count today, so this DTO does not invent one
    either (§Task 36 instruction 6/14 -- validate against existing
    domain rules, not new ones).
    """

    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, description="Owning workspace identifier.")
    commit_sha: str = Field(
        min_length=4,
        max_length=40,
        pattern=r"^[0-9a-fA-F]+$",
        description="Git commit SHA (full or abbreviated) this manifest snapshots.",
    )
    files: list[IngestFileEntry] = Field(default_factory=list)


class IngestResponse(BaseModel):
    """Response body for a successfully submitted ingestion job --
    mirrors :class:`app.domain.models.JobSubmissionResult` field-for-field.
    """

    model_config = ConfigDict(frozen=True)

    repository_id: str
    job_id: str
    status: ProcessingStatus
    submitted_at: datetime
