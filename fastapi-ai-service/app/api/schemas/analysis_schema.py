"""Request/response DTOs for the repository analysis API (Task 69).

Mirrors ``chat_schema.py``'s own posture: ``repository_id`` comes
exclusively from the URL path, never a body field. Inputs are narrow --
only what ``CommitAnalyzer``/``ChurnCalculator`` (Tasks 25/26) actually
need -- not a full copy of Express's `Commit`/`File` Mongo documents.

Bounded by construction (§Task 69 "avoid unnecessary infrastructure" /
repository-analysis is not meant to accept an unbounded payload): a
caller sending more than these caps gets FastAPI's own 422 request-shape
validation before a single byte reaches the analysis engines.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.domain.models import EngineeringInsight, HotspotMetrics, StructuralTrends

_MAX_COMMITS = 200
_MAX_FILES = 100


class AnalysisCommitInput(BaseModel):
    """One real, already-synced commit (Express `Commit` Mongo document,
    Task 68's own source of truth) -- the same shape
    :class:`app.domain.models.CommitInfo` needs, expressed as a request
    DTO so ``extra="forbid"`` catches an unexpected field at the API
    boundary rather than silently inside the domain model."""

    model_config = ConfigDict(extra="forbid")

    commit_sha: str = Field(min_length=1)
    message: str
    files_changed: list[str] = Field(default_factory=list, max_length=500)
    author_name: str | None = None
    author_email: str | None = None
    committed_at: datetime | None = None


class AnalysisFileInput(BaseModel):
    """One real file's content, fetched live from GitHub (Express only
    fetches this for the small, bounded set of files that actually
    appear in the analyzed commits' ``files_changed`` -- never the whole
    repository, see ``analysisEvidence.service.js``)."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(min_length=1)
    content: str
    language: str | None = None


class RepositoryAnalysisRequest(BaseModel):
    """Request body for ``POST /repositories/{repository_id}/analyze``.

    ``analyzed_commit_sha`` is the real branch-head SHA these ``files``
    were fetched as of (Express's already-synced ``Branch.latestCommitSha``)
    -- used only to satisfy :class:`~app.domain.models.Document`'s
    required ``commit_sha`` field with a real, honest snapshot identifier
    (same "commit this snapshot maps to" semantics
    ``ChunkMetadata.commit_sha`` already uses elsewhere in this codebase),
    never a per-file "last touched by" claim this payload has no way to
    know precisely for a file spanning many analyzed commits.
    """

    model_config = ConfigDict(extra="forbid")

    analyzed_commit_sha: str = Field(min_length=1)
    commits: list[AnalysisCommitInput] = Field(max_length=_MAX_COMMITS)
    files: list[AnalysisFileInput] = Field(max_length=_MAX_FILES)


class RepositoryAnalysisResponse(BaseModel):
    """Response body -- every field traces back to
    :class:`app.services.repository_analysis_service.RepositoryAnalysisService`'s
    real, deterministic computation over exactly the ``commits``/``files``
    supplied in the request. No field here is ever LLM-generated in this
    version (Task 69 §3: deterministic analysis preferred where it is
    "more appropriate", and it is appropriate for every finding this
    reuses from Tasks 25-28's already-tested engines)."""

    model_config = ConfigDict(frozen=True)

    repository_id: str
    generated_at: datetime
    analyzed_commit_count: int = Field(ge=0)
    analyzed_file_count: int = Field(ge=0)
    hotspots: list[HotspotMetrics]
    trends: StructuralTrends
    insights: list[EngineeringInsight]
