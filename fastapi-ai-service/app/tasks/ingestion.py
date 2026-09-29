"""Repository Ingestion Celery Task (Task 40).

The Celery worker-side consumer of the ingestion job
:meth:`~app.services.repository_processing_service.RepositoryProcessingService.submit_ingestion_job`
(Task 30) already dispatches via::

    celery_app.send_task(
        "app.tasks.ingestion.process_repository",
        args=[manifest.model_dump(mode="json")],
        queue="ingestion",
    )

Task 30's own module docstring names this exact task name/queue pair as
a forward reference this module fulfills -- neither is invented here.
Routing is already handled by ``task_queue.py``'s
``"app.tasks.ingestion.*"`` pattern (Task 11), so this module's
``@celery_app.task`` registration needs no ``queue=`` kwarg of its own;
Task 30's explicit ``queue="ingestion"`` argument on ``send_task`` and
the routing pattern agree, belt-and-suspenders.

Composition root: this module builds its own process-wide singleton
infra clients (``@lru_cache``, the same pattern ``app.api.deps`` uses
for ``get_chroma_client``/``get_cache_client``/``get_embedder``) rather
than importing ``app.api.deps`` directly -- a Celery worker process
never serves HTTP requests and has no reason to import FastAPI/the API
layer. Mirroring the DI *pattern* (not importing the *module*) keeps
the worker's composition root independent of the API layer, consistent
with the project's layered architecture (API / Services / Core / Infra
/ Domain -- Tasks are their own entry point, parallel to API, not
beneath it).

Sync/async boundary: Celery task bodies are plain synchronous functions
(no ``celery.asyncio``); ``asyncio.run`` is the standard bridge for a
task whose actual work
(:meth:`~app.services.repository_ingestion_worker_service.RepositoryIngestionWorkerService.process_ingestion_job`)
is async -- the same sync/async boundary pattern already documented in
``app.infra.queue.task_queue`` and
``app.services.repository_processing_service`` (both use
``asyncio.to_thread`` for the opposite direction: a blocking call made
from async code). A fresh event loop per task invocation is correct
here: Celery's default prefork worker runs one task at a time per
worker process, so there is no concurrent event loop to conflict with.

Retry policy: deliberately none at the Celery level (no
``autoretry_for``, no ``self.retry()``). Every transient infrastructure
failure this task can hit -- Redis, ChromaDB, the NVIDIA embedding API
-- is already retried with bounded exponential backoff *inside* its own
adapter (``RedisClient._run_with_retry``, ``VectorStoreClient._run_blocking``,
``NemotronEmbedder._run_with_retry``, all pre-existing) before it ever
reaches this task as a raised ``CacheError``/``VectorDBError``/
``EmbeddingError``. Adding a second, independent Celery-level retry on
top would be exactly the "aggressive/invented retry policy" the Task 40
brief warns against -- retrying calls that already retry themselves. A
failure that reaches this task's ``except`` block (via
``RepositoryIngestionWorkerService.process_ingestion_job``, which
already marks the status record FAILED before re-raising) is this job's
terminal failure: the exception propagates so Celery's own task-failure
bookkeeping/logging records it too, and ``task_acks_late=True``
(``task_queue.py``) means it is still acknowledged/removed from the
broker once this task function returns or raises -- a failed job is
never silently retried or left stuck on the queue; only a worker
*process crash* (not a raised exception) causes redelivery, per Celery's
own late-ack semantics.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

import structlog

from app.config.settings import get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.infra.cache.cache_client import RedisClient
from app.infra.http.express_client import ExpressCallbackClient
from app.infra.vectorstore.client import VectorStoreClient, create_vector_store
from app.services.repository_ingestion_worker_service import RepositoryIngestionWorkerService

logger = structlog.get_logger("seis.tasks.ingestion")


@lru_cache(maxsize=1)
def _get_chroma_client() -> VectorStoreClient:
    return create_vector_store(get_settings())


@lru_cache(maxsize=1)
def _get_cache_client() -> RedisClient:
    return RedisClient(settings=get_settings())


@lru_cache(maxsize=1)
def _get_embedder() -> NemotronEmbedder:
    return NemotronEmbedder(settings=get_settings())


@lru_cache(maxsize=1)
def _get_embedding_cache() -> EmbeddingCache:
    return EmbeddingCache(redis_client=_get_cache_client(), settings=get_settings())


@lru_cache(maxsize=1)
def _get_express_callback_client() -> ExpressCallbackClient:
    return ExpressCallbackClient(settings=get_settings())


def _build_worker_service() -> RepositoryIngestionWorkerService:
    """Composition root for one task invocation's dependencies.

    A fresh :class:`RepositoryIngestionWorkerService` per invocation
    (cheap, stateless orchestration object); the infra clients it is
    built from are the process-wide lazy singletons above -- construction
    itself never opens a connection (see each client's own module
    docstring), so this never fails or blocks at task-startup time, only
    a real operation inside ``process_ingestion_job`` can.
    """
    return RepositoryIngestionWorkerService(
        chroma_client=_get_chroma_client(),
        document_processor=DocumentProcessor(),
        chunker=ASTChunker(),
        metadata_generator=MetadataGenerator(),
        embedder=_get_embedder(),
        embedding_cache=_get_embedding_cache(),
        cache_client=_get_cache_client(),
        express_callback_client=_get_express_callback_client(),
    )


def process_repository(payload: dict[str, Any], *, job_id: str | None = None) -> None:
    """Entry point for one repository ingestion job (Task 40 / Task T5).

    ``payload`` is the JSON-decoded dict produced via
    ``manifest.model_dump(mode="json")`` -- reconstructed into a
    :class:`~app.domain.models.RepositoryManifest` by
    :meth:`RepositoryIngestionWorkerService.process_ingestion_job`.
    """
    log = logger.bind(job_id=job_id)
    log.info("ingestion_task.received")
    service = _build_worker_service()
    asyncio.run(service.process_ingestion_job(payload, job_id=job_id))
