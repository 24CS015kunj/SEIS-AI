"""Shared enums.

``ProcessingStatus``/``ProcessingStage`` (full state model, §22 and its
§13 sub-stages), ``ChunkType`` (§21.4), ``DocumentType`` (§21.5),
``ConversationRole`` and ``TaskType`` (§21.1), and ``ErrorCategory``
(§14.1 -- relocated here from ``domain.exceptions`` now that this
module exists; ``exceptions.py`` imports it from here).

All string-valued (``str, Enum``) so every enum serializes to JSON as
its plain value with no custom encoder, consistent with ``Environment``
in ``config.settings`` and the rest of the codebase.
"""

from enum import Enum


class ProcessingStatus(str, Enum):
    """Full repository lifecycle state set (§22). ``PROCESSING`` is an
    umbrella state; see :class:`ProcessingStage` for its sub-stages.
    """

    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    UPDATING = "updating"
    FAILED = "failed"
    ARCHIVED = "archived"
    DELETED = "deleted"
    RECOVERY = "recovery"
    ROLLBACK = "rollback"


class ProcessingStage(str, Enum):
    """Sub-stages of :attr:`ProcessingStatus.PROCESSING` /
    :attr:`ProcessingStatus.UPDATING` (§13). Only meaningful while the
    parent status is one of those two -- ``None`` otherwise.
    """

    CLONING_MANIFEST = "cloning_manifest"
    DOCUMENT_PROCESSING = "document_processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"


class ChunkType(str, Enum):
    """Chunk granularity/origin (§21.4)."""

    CODE_FUNCTION = "code_function"
    CODE_CLASS = "code_class"
    CODE_MODULE_HEADER = "code_module_header"
    MARKDOWN_SECTION = "markdown_section"
    CONFIG_BLOCK = "config_block"
    TEST_CASE = "test_case"
    GENERIC_TEXT = "generic_text"
    # One rendered "## <Section>" block of a compiled evolution report
    # (Task 29, §7.5) -- distinct from every source-code chunk type so
    # evolution content can be filtered out of/into a search separately
    # (Best Practices: "use distinct chunk type metadata for filtered
    # search capability").
    EVOLUTION_SECTION = "evolution_section"


class DocumentType(str, Enum):
    """Source file classification (§21.5). ``GENERATED_LOCKFILE`` and
    ``BINARY_ASSET`` are classified but excluded from indexing by the
    Repository Processing Engine's filter stage (§6.1) -- they remain
    real enum values because the exclusion decision happens *after*
    classification, not instead of it.
    """

    SOURCE_CODE = "source_code"
    MARKDOWN_DOC = "markdown_doc"
    CONFIG_FILE = "config_file"
    TEST_FILE = "test_file"
    CHANGELOG = "changelog"
    GENERATED_LOCKFILE = "generated_lockfile"
    BINARY_ASSET = "binary_asset"
    # A compiled Software Evolution report chunk (Task 29, §7.5) --
    # synthetic content this service generates itself, not a file that
    # ever existed in the repository's own tree.
    EVOLUTION_REPORT = "evolution_report"


class ConversationRole(str, Enum):
    """Speaker role within a Repository Chat conversation (§5.11)."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class TaskType(str, Enum):
    """Generation task type -- selects the prompt template (§20)."""

    CHAT = "chat"
    SEARCH = "search"
    EVOLUTION_NARRATION = "evolution_narration"
    CODE_EXPLANATION = "code_explanation"
    ARCHITECTURE_SUMMARY = "architecture_summary"
    DOCUMENTATION_SUMMARY = "documentation_summary"


class CommitCategory(str, Enum):
    """Conventional Commits type classification (Task 25, §7.1). ``OTHER``
    covers any message that either has no recognizable conventional-commit
    prefix or uses one this enum doesn't enumerate -- never a hard failure.
    """

    FEAT = "feat"
    FIX = "fix"
    REFACTOR = "refactor"
    CHORE = "chore"
    DOCS = "docs"
    STYLE = "style"
    TEST = "test"
    PERF = "perf"
    BUILD = "build"
    CI = "ci"
    REVERT = "revert"
    OTHER = "other"


class InsightCategory(str, Enum):
    """Engineering insight classification (Task 28, §7.4)."""

    HIGH_RISK_MODULE = "high_risk_module"
    BUS_FACTOR_WARNING = "bus_factor_warning"
    REFACTORING_RECOMMENDED = "refactoring_recommended"


class InsightSeverity(str, Enum):
    """Impact severity rating for an :class:`~app.domain.models.EngineeringInsight`
    (Task 28, §7.4)."""

    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"


class ErrorCategory(str, Enum):
    """Error taxonomy (§14.1) -- drives retry policy and log severity.

    Consumed by the exception hierarchy in ``domain.exceptions``.
    """

    TRANSIENT = "transient"
    RATE_LIMIT = "rate_limit"
    VALIDATION = "validation"
    DOMAIN = "domain"
    PARTIAL = "partial"
    UNKNOWN = "unknown"
