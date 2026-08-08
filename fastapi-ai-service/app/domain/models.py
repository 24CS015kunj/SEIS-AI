"""Shared domain models.

Repository, Chunk, Embedding, SearchRequest/Response, ChatRequest/
Response, ProcessingStatusRecord, and the canonical chunk Metadata
schema (§21.6), plus small shared models (TokenUsage, ErrorResponse).

These are domain-level models -- framework-agnostic, reusable by the
Service layer, the Core Pipeline, and offline evaluation scripts alike
(§3.1). They are deliberately distinct from ``app/api/schemas/*.py``:
the API layer's wire-format DTOs may wrap, subset, or version these
differently per endpoint without that decision rippling into business
logic. Search/Chat request-response pairs are named here because
that's the concept Task 7 asks for; the actual FastAPI request bodies
in ``api/schemas/`` are built when their endpoints are implemented
(Week 3+) and may adapt these rather than reuse them verbatim.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import (
    ChunkType,
    ConversationRole,
    DocumentType,
    ProcessingStage,
    ProcessingStatus,
)


class ChunkMetadata(BaseModel):
    """Canonical chunk metadata schema (§21.6) -- the contract every
    module producing or consuming a :class:`Chunk` must respect.
    """

    repository_id: str
    file_path: str
    language: str
    commit_sha: str
    chunk_type: ChunkType
    document_type: DocumentType
    symbol_name: str | None = None
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    # Set only once the Embedder (§5.4) and ChromaDB write path (§5.5)
    # have actually run -- absent on a freshly chunked, not-yet-embedded
    # Chunk.
    embedding_model_version: str | None = None
    indexed_at: datetime | None = None


class Chunk(BaseModel):
    """A semantically coherent unit of repository content prepared for
    embedding (§5.3, Glossary).
    """

    chunk_id: str
    content: str
    metadata: ChunkMetadata


class Embedding(BaseModel):
    """A dense vector representation of a :class:`Chunk`, ready for
    ChromaDB upsert (§5.4).
    """

    chunk_id: str
    vector: list[float]
    model_version: str


class Repository(BaseModel):
    """The AI service's read-only view of a repository (§6.1, §12).

    Express remains the system of record for repository metadata
    (§12 Service Boundaries) -- this model is what the AI layer
    operates against once Express has handed a repository off for
    processing, not an independent copy the AI layer owns or writes
    back to.
    """

    repository_id: str
    workspace_id: str  # workspace-level isolation, defense-in-depth (§26.7)
    name: str
    default_branch: str
    primary_language: str | None = None
    commit_sha: str
    status: ProcessingStatus
    stage: ProcessingStage | None = None  # only meaningful mid-PROCESSING/UPDATING


class ProcessingStatusRecord(BaseModel):
    """Persisted processing-status record for a repository (§6.1, §13,
    §22). What ``GET /repositories/{id}/status`` (§11.2) serializes,
    and what survives a worker restart so status stays queryable
    mid-run.
    """

    repository_id: str
    status: ProcessingStatus
    stage: ProcessingStage | None = None
    commit_sha: str
    started_at: datetime
    updated_at: datetime
    error: str | None = None
    file_count: int | None = None
    chunk_count: int | None = None


class TokenUsage(BaseModel):
    """Gemini token accounting for one generation call (§24.7)."""

    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)


class SearchRequest(BaseModel):
    """Semantic Search input (§5.12, §11.2, §23.4)."""

    repository_id: str
    query: str = Field(min_length=1, max_length=2000)
    # Per-request override of the configured default (§19.1 layer 5) --
    # bounded so a caller can't force an unreasonably expensive search.
    top_k: int | None = Field(default=None, gt=0, le=100)
    filters: dict[str, str] | None = None


class SearchResultItem(BaseModel):
    """One ranked chunk in a :class:`SearchResponse`."""

    chunk_id: str
    content: str
    score: float = Field(ge=0.0, le=1.0)
    metadata: ChunkMetadata


class SearchResponse(BaseModel):
    """Semantic Search output (§5.12, §23.4)."""

    repository_id: str
    query: str
    results: list[SearchResultItem]


class ChatMessage(BaseModel):
    """One turn in a Repository Chat conversation (§5.11, §20.4)."""

    role: ConversationRole
    content: str


class ChatRequest(BaseModel):
    """Repository Chat input (§5.11, §11.2, §23.3)."""

    repository_id: str
    conversation_id: str
    message: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list)


class Citation(BaseModel):
    """A source attribution for a claim in a chat answer (§5.7). Every
    factual claim in a :class:`ChatResponse` must be traceable to one
    of these -- the primary hallucination-prevention mechanism (§5.8).
    """

    file_path: str
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    chunk_id: str


class ChatResponse(BaseModel):
    """Repository Chat output (§5.11, §11.2, §23.3)."""

    conversation_id: str
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    token_usage: TokenUsage | None = None


class ErrorDetail(BaseModel):
    """Inner payload of the JSON error envelope every exception handler
    in ``app.main`` returns (§14 Error Handling Strategy).
    """

    model_config = ConfigDict(populate_by_name=True)

    code: str
    message: str
    correlation_id: str = Field(serialization_alias="correlationId")
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """The full JSON body of every error response this service returns."""

    error: ErrorDetail
