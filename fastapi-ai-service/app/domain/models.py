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
    CommitCategory,
    ConversationRole,
    DocumentType,
    InsightCategory,
    InsightSeverity,
    ProcessingStage,
    ProcessingStatus,
)


class ManifestFile(BaseModel):
    """One file entry within a :class:`RepositoryManifest` (§6.1 Trigger
    Contract) -- Express's ``fileManifest`` array, already normalized
    into the shape this layer consumes. ``content`` is inlined bytes
    rather than a ``contentUrl``: FastAPI never talks to GitHub
    directly (§Project Rules #1.4), and fetching a URL is an I/O
    concern that belongs to an infra adapter, not this Domain-layer
    model. ``content`` is ``None`` for entries Express did not inline
    (oversized/binary originals) -- the Document Processor (Task 13)
    skips those rather than guessing at their content.
    """

    model_config = ConfigDict(frozen=True)

    path: str
    content: bytes | None = None
    language: str | None = None
    size_bytes: int = Field(ge=0)


class RepositoryManifest(BaseModel):
    """Express's per-repository ingestion payload (§6.1 Trigger
    Contract) -- the entry point to the Repository Processing Engine
    (§6.2). Named in Task 7's original scope but not actually defined
    until Task 13 needed it as the input to ``DocumentProcessor``.
    """

    model_config = ConfigDict(frozen=True)

    repository_id: str
    workspace_id: str  # workspace-level isolation, defense-in-depth (§26.7)
    commit_sha: str
    files: list[ManifestFile]


class DiffManifest(BaseModel):
    """A single commit's file-level diff (§18 Architecture Reasoning) --
    the input to the Incremental Repository Synchronizer (Task 18),
    letting a push update only the affected files' vectors instead of
    rebuilding a repository's entire collection. ``repository_id`` is
    deliberately not a field here: Task 18's own
    ``process_diff(repository_id: str, diff_manifest: DiffManifest)``
    signature already takes it as a separate argument, so it isn't
    duplicated onto this model. ``workspace_id`` is included because
    reprocessing ``added_files``/``modified_files`` reuses
    ``DocumentProcessor.process_manifest``, which requires a
    :class:`RepositoryManifest` -- and that model requires it.
    """

    model_config = ConfigDict(frozen=True)

    workspace_id: str
    commit_sha: str
    added_files: list[ManifestFile] = Field(default_factory=list)
    modified_files: list[ManifestFile] = Field(default_factory=list)
    deleted_files: list[str] = Field(default_factory=list)


class Document(BaseModel):
    """A normalized, classified repository file ready for chunking
    (§5.3, §21.5) -- the ``DocumentProcessor``'s output and the
    ``ASTChunker``'s (Task 14) input. Carries ``repository_id`` and
    ``commit_sha`` forward from the manifest so the ``MetadataGenerator``
    (Task 17) can read them straight off the document without needing a
    separate manifest reference, matching the §21.6 metadata contract.
    """

    model_config = ConfigDict(frozen=True)

    repository_id: str
    commit_sha: str
    file_path: str
    content: str
    language: str
    document_type: DocumentType


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


class ContextBlock(BaseModel):
    """Packed retrieval context ready for prompt assembly (§5.6/§5.7,
    Task 21) -- the ``ContextBuilder``'s output and the Grounded Prompt
    Builder's (Task 22) input.

    Named in Task 21's own signature (``build_context(...) ->
    ContextBlock``) but never actually defined until this task needed
    it -- the same "genuine gap, not invented" pattern already applied
    to :class:`RepositoryManifest`/:class:`Document` (Task 13) and
    :class:`DiffManifest` (Task 18). ``citation_map`` reuses the
    frozen Task 7 :class:`Citation` model (``file_path``, ``start_line``,
    ``end_line``, ``chunk_id``) rather than inventing a duplicate
    "CitationMapEntry" shape -- a numeric citation tag (``[1]``, ``[2]``)
    is exactly a citation missing only the answer text it will
    eventually attach to, which :class:`Citation` already carries.
    """

    model_config = ConfigDict(frozen=True)

    text: str
    citation_map: dict[int, Citation]
    token_count: int = Field(ge=0)
    truncated: bool


class GroundedPrompt(BaseModel):
    """A fully assembled, injection-defended prompt payload (§5.8, Task
    22) -- the Grounded Prompt Builder's output and
    ``GeminiGateway.generate_text``'s (Task 12) input. Its two fields
    map directly onto that frozen signature's ``system_instruction``
    and ``prompt`` parameters, so a caller (Task 32's Repository Chat
    Service) can pass them straight through without reshaping.

    Named in Task 22's own signature (``build_chat_prompt(...) ->
    GroundedPrompt``) but never actually defined until this task needed
    it -- the same "genuine gap, not invented" pattern already applied
    to :class:`ContextBlock` (Task 21) and its predecessors.
    """

    model_config = ConfigDict(frozen=True)

    system_instruction: str
    user_prompt: str


class ChatResponse(BaseModel):
    """Repository Chat output (§5.11, §11.2, §23.3)."""

    conversation_id: str
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    token_usage: TokenUsage | None = None


class CommitInfo(BaseModel):
    """One commit from Express's repository history payload (Task 25,
    §7.1) -- the ``CommitAnalyzer``'s input. Deliberately narrow: only
    what commit-history mining actually needs, not a full copy of every
    field a Git provider's API might return.

    ``author_email``/``committed_at`` are optional (Common Mistakes:
    "failing to handle missing author email or timestamp fields") --
    Express's upstream source may not always have them (e.g. a squashed
    or bot-authored commit). :class:`CommitAnalyzer` degrades gracefully
    rather than raising when either is absent.
    """

    model_config = ConfigDict(frozen=True)

    commit_sha: str
    message: str
    files_changed: list[str] = Field(default_factory=list)
    author_name: str | None = None
    author_email: str | None = None
    committed_at: datetime | None = None


class FileChangeWindowCounts(BaseModel):
    """A file's commit-frequency counts across the three fixed lookback
    windows Task 25's own spec names (§7.1 subtask 3) -- 30/90/180 days
    from :class:`CommitAnalysisResult`'s ``reference_time``.
    """

    model_config = ConfigDict(frozen=True)

    last_30_days: int = Field(ge=0)
    last_90_days: int = Field(ge=0)
    last_180_days: int = Field(ge=0)


class AuthorContribution(BaseModel):
    """One contributor's commit count within an analyzed commit set
    (Task 25, §7.1 Responsibilities: "aggregate author contribution
    metrics"). ``author`` is whichever identifier a given commit
    actually carried -- email preferred, else name, else a fixed
    "unknown" placeholder -- never a crash on missing identity data.
    """

    model_config = ConfigDict(frozen=True)

    author: str
    commit_count: int = Field(ge=0)


class CommitAnalysisResult(BaseModel):
    """Structured commit-history summary (Task 25, §7.1) -- named in
    ``CommitAnalyzer.analyze_commits``'s own signature but never
    actually defined until this task needed it, the same "genuine gap,
    not invented" pattern already applied to :class:`ContextBlock`
    (Task 21) and its predecessors. Consumed directly by
    :class:`ChurnCalculator` (Task 26) as ``calculate_hotspots``'s
    first argument.
    """

    model_config = ConfigDict(frozen=True)

    total_commits: int = Field(ge=0)
    file_modification_counts: dict[str, int]
    file_modification_windows: dict[str, FileChangeWindowCounts]
    author_contributions: list[AuthorContribution]
    commit_type_counts: dict[CommitCategory, int]
    # What "now" was when the 30/90/180-day windows above were computed
    # -- carried on the result so a report generated from it can state
    # its own as-of date, and so window counts are reproducible/testable
    # rather than silently depending on wall-clock time at read time.
    reference_time: datetime


class HotspotMetrics(BaseModel):
    """A file's churn-based risk ranking (Task 26, §7.2) -- named in
    ``ChurnCalculator.calculate_hotspots``'s own signature but never
    actually defined until this task needed it, the same "genuine gap,
    not invented" pattern already applied to :class:`CommitAnalysisResult`
    (Task 25) and its predecessors. ``hotspot_score`` is normalized to
    ``[0.0, 100.0]`` (Best Practices) as a percentage of the highest raw
    score in the ranked set -- ``commit_count``/``line_count`` are kept
    alongside it so a caller/report can show the underlying numbers
    rather than only the normalized score.
    """

    model_config = ConfigDict(frozen=True)

    file_path: str
    commit_count: int = Field(ge=0)
    line_count: int = Field(ge=0)
    hotspot_score: float = Field(ge=0.0, le=100.0)


class ModuleTrend(BaseModel):
    """Aggregated churn for one top-level module directory (Task 27,
    §7.3) -- e.g. ``app/core`` or ``app/infra``, not a deep subpath.
    """

    model_config = ConfigDict(frozen=True)

    module: str
    file_count: int = Field(ge=0)
    commit_count: int = Field(ge=0)
    # Fraction (not percentage) of the analyzed hotspots' total commit
    # count this module accounts for -- subtask 4's ">50%" threshold is
    # `churn_share > 0.5`.
    churn_share: float = Field(ge=0.0, le=1.0)
    is_high_churn: bool


class StructuralTrends(BaseModel):
    """Structural module trend metrics (Task 27, §7.3) -- named in
    ``TrendDetector.detect_trends``'s own signature but never actually
    defined until this task needed it, the same "genuine gap, not
    invented" pattern already applied to :class:`HotspotMetrics` (Task
    26) and its predecessors. Consumed by :class:`InsightsGenerator`
    (Task 28) as ``generate_insights``'s second argument.
    """

    model_config = ConfigDict(frozen=True)

    # Sorted descending by churn_share -- the highest-churn module first.
    module_trends: list[ModuleTrend]
    # Convenience accessor: module names with churn_share > 0.5, in the
    # same relative order as module_trends. Derivable from module_trends
    # itself (``m.module for m in module_trends if m.is_high_churn``),
    # kept as its own field because subtask 4 names "identify modules
    # experiencing >50% of overall churn" as a distinct deliverable from
    # subtask 3's grouping, not merely a filter a caller must apply.
    high_churn_modules: list[str]


class EngineeringInsight(BaseModel):
    """One actionable engineering recommendation (Task 28, §7.4) --
    named in ``InsightsGenerator.generate_insights``'s own signature but
    never actually defined until this task needed it, the same "genuine
    gap, not invented" pattern already applied to :class:`StructuralTrends`
    (Task 27) and its predecessors. ``recommendation`` is always
    non-empty, concrete remediation text (Best Practices: "include
    concise remediation recommendations alongside every warning";
    Common Mistakes: "generating vague, unactionable warnings") --
    never only a bare metric restated as a sentence.
    """

    model_config = ConfigDict(frozen=True)

    category: InsightCategory
    severity: InsightSeverity
    # The file path or module name this insight concerns -- whichever
    # the category operates on (a file for HIGH_RISK_MODULE/
    # REFACTORING_RECOMMENDED, a module directory for BUS_FACTOR_WARNING).
    subject: str
    summary: str
    recommendation: str


class EvolutionReport(BaseModel):
    """A compiled, indexed Software Evolution report (Task 29, §7.5) --
    named in ``EvolutionIndexer.compile_and_index_report``'s own
    signature but never actually defined until this task needed it, the
    same "genuine gap, not invented" pattern already applied to
    :class:`EngineeringInsight` (Task 28) and its predecessors.
    """

    model_config = ConfigDict(frozen=True)

    repository_id: str
    markdown: str
    generated_at: datetime
    # How many section chunks were actually upserted into ChromaDB --
    # a caller-visible confirmation that indexing genuinely happened
    # (Common Mistakes: "failing to index evolution reports, making
    # history inaccessible to chat"), not merely that the markdown was
    # compiled in memory.
    indexed_chunk_count: int = Field(ge=0)


class JobSubmissionResult(BaseModel):
    """Confirmation payload for a newly enqueued ingestion job (Task 30,
    §6.1/§22) -- named in ``RepositoryProcessingService.submit_ingestion_job``'s
    own signature but never actually defined until this task needed it,
    the same "genuine gap, not invented" pattern already applied to
    :class:`EvolutionReport` (Task 29) and its predecessors.

    ``job_id`` is the Celery task id returned by ``send_task`` (the
    ``AsyncResult.id`` of the dispatched, not-yet-executed job) -- a
    caller can use it to correlate with worker logs once Task 40 exists,
    but this service never polls it back; processing status is tracked
    independently via :class:`ProcessingStatusRecord` in Redis, not via
    Celery's own result backend.
    """

    model_config = ConfigDict(frozen=True)

    repository_id: str
    job_id: str
    status: ProcessingStatus
    submitted_at: datetime


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
