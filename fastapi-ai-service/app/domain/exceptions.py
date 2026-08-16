"""Domain exception hierarchy.

Base application exception plus Business, Validation, Repository,
Embedding, VectorDB, Cache, and LLM exceptions, mapped to the error
taxonomy in §14.1 and translated to HTTP responses by the
``seis_error_handler`` registered in ``app.main`` (§14 Error Handling
Strategy, §21.1).

Deliberately framework-agnostic: ``http_status`` is a plain int, not a
``fastapi.status`` constant, so this module has zero dependency on
FastAPI/Starlette and stays importable from a CLI script or from deep
inside the Core Pipeline layer (§3.1).

``ErrorCategory`` lives in ``domain.enums`` (Task 7 consolidated the
shared enums there) and is re-imported here rather than redefined.
"""

from collections.abc import Mapping
from typing import Any, ClassVar

from app.domain.enums import ErrorCategory

__all__ = [
    "ErrorCategory",
    "SEISError",
    "SEISAuthorizationError",
    "BusinessError",
    "DomainValidationError",
    "RepositoryError",
    "EmbeddingError",
    "VectorDBError",
    "CacheError",
    "LLMError",
    "LLMRateLimitError",
    "RerankError",
    "QueueError",
    "RepositoryNotFoundError",
]


class SEISError(Exception):
    """Base class for every domain exception raised anywhere in the AI
    service. Never raised directly -- always raise a specific subclass.

    Carries enough structure for one generic exception handler
    (``app.main.seis_error_handler``) to build a consistent JSON error
    envelope for every subclass, without per-type branching logic at
    the API layer. Registering a handler for this base class is
    sufficient for Starlette to route every subclass instance to it
    (MRO-based lookup) -- individual subclasses never need their own
    handler registration.
    """

    code: ClassVar[str] = "INTERNAL_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.UNKNOWN
    http_status: ClassVar[int] = 500
    retryable: ClassVar[bool] = False

    def __init__(self, message: str, *, details: Mapping[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details: dict[str, Any] = dict(details) if details else {}


class SEISAuthorizationError(SEISError):
    """Service-to-service authorization failure -- missing or invalid
    Authorization Bearer token presented by caller (§26.1-§26.2).
    """

    code: ClassVar[str] = "UNAUTHORIZED"
    category: ClassVar[ErrorCategory] = ErrorCategory.VALIDATION
    http_status: ClassVar[int] = 401
    retryable: ClassVar[bool] = False


class BusinessError(SEISError):
    """Domain/business rule violation -- e.g. a repository exceeds the
    current tier's size limit, or requests an unsupported language
    (§14.1 Domain/Business). Never retryable: retrying without changing
    the input fails identically.
    """

    code: ClassVar[str] = "BUSINESS_RULE_VIOLATION"
    category: ClassVar[ErrorCategory] = ErrorCategory.DOMAIN
    http_status: ClassVar[int] = 422
    retryable: ClassVar[bool] = False


class DomainValidationError(SEISError):
    """Business-level validation failure, distinct from FastAPI's
    request-shape validation (``RequestValidationError``, handled
    separately in ``app.main``). Raised deep in the pipeline when a
    value violates an invariant a Pydantic schema alone can't express
    -- e.g. a Chunk with empty content after normalization.
    """

    code: ClassVar[str] = "DOMAIN_VALIDATION_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.VALIDATION
    http_status: ClassVar[int] = 422
    retryable: ClassVar[bool] = False


class RepositoryError(SEISError):
    """Repository Processing Engine failure (§5.1, §6) -- malformed file
    manifest, unsupported repository structure, payload too large.
    """

    code: ClassVar[str] = "REPOSITORY_PROCESSING_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.DOMAIN
    http_status: ClassVar[int] = 422
    retryable: ClassVar[bool] = False


class EmbeddingError(SEISError):
    """Embedding Pipeline failure (§5.4) -- embedding model call failed,
    vector dimension mismatch, cache corruption. Retryable by default:
    most failures here are transient infrastructure issues (§14.1).
    """

    code: ClassVar[str] = "EMBEDDING_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 502
    retryable: ClassVar[bool] = True


class VectorDBError(SEISError):
    """ChromaDB adapter failure (§5.5) -- connection refused, collection
    missing, write conflict during upsert. Retryable by default.
    """

    code: ClassVar[str] = "VECTOR_DB_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 503
    retryable: ClassVar[bool] = True


class CacheError(SEISError):
    """Redis cache/lock adapter failure (§Task 10) -- connection refused,
    command error, lock acquisition failure. Retryable by default: like
    :class:`VectorDBError`, most failures here are transient
    infrastructure issues rather than malformed requests. Not present in
    the original Task 6 taxonomy (unlike ``VectorDBError``, which
    anticipated ChromaDB) -- added here as Task 10's infrastructure
    adapter, following the same pattern rather than inventing a
    parallel hierarchy.
    """

    code: ClassVar[str] = "CACHE_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 503
    retryable: ClassVar[bool] = True


class LLMError(SEISError):
    """Gemini Gateway failure (§5.9) -- timeout, malformed response,
    generation failure. Retryable by default, subject to the circuit
    breaker described in §14.2.
    """

    code: ClassVar[str] = "LLM_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 502
    retryable: ClassVar[bool] = True


class LLMRateLimitError(LLMError):
    """Gemini rate-limited this service. A distinct subclass (rather
    than a generic LLMError) so callers and the circuit breaker can
    apply backoff specifically for rate limiting (§14.1 Rate Limit).
    """

    code: ClassVar[str] = "LLM_RATE_LIMIT"
    category: ClassVar[ErrorCategory] = ErrorCategory.RATE_LIMIT
    http_status: ClassVar[int] = 429
    retryable: ClassVar[bool] = True


class RerankError(SEISError):
    """RAG Optimization Engine failure (Task 24) -- NVIDIA hosted
    reranking API call failed, timed out, or returned a malformed
    response. Not present in the original Task 6 taxonomy (no reranker
    existed yet); added here following the same pattern
    :class:`CacheError` used to extend the hierarchy for Task 10's new
    infrastructure dependency rather than inventing a parallel one.
    Retryable by default: most failures here are transient
    infrastructure issues, same reasoning as :class:`EmbeddingError`.
    """

    code: ClassVar[str] = "RERANK_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 502
    retryable: ClassVar[bool] = True


class QueueError(SEISError):
    """Celery task queue adapter failure (Task 30) -- broker unreachable
    or ``send_task`` dispatch failed. Not present in the original Task 6
    taxonomy (Task 30 is the first module that actually enqueues a task
    rather than just configuring the Celery app object, Task 11); added
    here following the same pattern :class:`CacheError`/:class:`RerankError`
    used to extend the hierarchy for a new infrastructure dependency
    rather than inventing a parallel one. Retryable by default: same
    reasoning as :class:`CacheError` -- most failures here are transient
    broker connectivity issues, not malformed job payloads.
    """

    code: ClassVar[str] = "QUEUE_ERROR"
    category: ClassVar[ErrorCategory] = ErrorCategory.TRANSIENT
    http_status: ClassVar[int] = 503
    retryable: ClassVar[bool] = True


class RepositoryNotFoundError(SEISError):
    """No processing status record exists for the requested
    ``repository_id`` (Task 30) -- either it was never submitted for
    ingestion, or its status record's TTL (§Common Mistakes: a
    processing record must not persist forever) has already expired.
    Not a :class:`RepositoryError` (§14.1 Domain -- malformed
    manifest/unsupported structure): this is a lookup failure, so it
    gets its own 404, the first exception in this hierarchy that does.
    """

    code: ClassVar[str] = "REPOSITORY_NOT_FOUND"
    category: ClassVar[ErrorCategory] = ErrorCategory.DOMAIN
    http_status: ClassVar[int] = 404
    retryable: ClassVar[bool] = False
