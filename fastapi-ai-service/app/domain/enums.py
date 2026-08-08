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
