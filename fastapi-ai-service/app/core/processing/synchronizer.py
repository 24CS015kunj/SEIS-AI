"""Incremental Repository Synchronizer.

Task 18 (final task in Phase 3): ``IncrementalSynchronizer.process_diff``
processes a commit's file-level diff -- deleting stale vectors for
``deleted_files``/``modified_files`` and re-processing/chunking/
embedding/inserting ``added_files``/``modified_files`` -- so a push
updates only the affected files' vectors instead of rebuilding a
repository's entire ChromaDB collection.

Scope notes (documented, not silent):

- **Dependencies beyond the task's own line**: the Phase-02 spec text
  lists ``app.infra.vectorstore.chroma_client, app.core.processing,
  app.domain``, but subtask 4 ("process, chunk, embed, and insert")
  is impossible without the Embedding Pipeline (Task 15,
  ``app.core.embedding.embedder``) and Embedding Cache (Task 16,
  ``app.core.embedding.embedding_cache``). Both are used here --
  omitting them would make the task's own subtask unimplementable, so
  this reads as an imprecise dependency line (already seen elsewhere
  in this phase) rather than a deliberate exclusion, unlike Task 15's
  explicit "build your own client" instruction.
- **Delete-then-insert ordering**: stale vectors for
  ``deleted_files``/``modified_files`` are removed *before* any new
  vectors are inserted (§Common Mistakes: "forgetting to delete
  obsolete vectors for modified files before inserting new ones").
- **"Update repository status to READY" (subtask 5)**: represented
  here as a structured log event only. The master spec's own sequence
  diagram (§8) shows this status write going to Express/Mongo via a
  callback ("W->>M: Update status = READY", where M = "Status Store
  (Mongo, via Express)"), and that HTTP client
  (``app/infra/http/express_client.py``) is Task 42 -- Phase 8, not
  yet built. Logging the transition now, rather than fabricating an
  HTTP call to infrastructure that doesn't exist, keeps this task
  honest about what it can actually do; a future Task 42 integration
  point is exactly where the real callback belongs.
- **"Transactions/rollback" (§Best Practices)**: ChromaDB has no
  multi-operation transaction primitive, and the frozen Task 9 adapter
  doesn't expose one. True rollback (re-inserting exactly the vectors
  that existed before a failed delete) isn't attempted. The mitigation
  actually available: delete-then-insert ordering (a failure after
  deletion leaves stale content *removed*, never duplicated) plus
  every chunk ID being deterministic (Task 14 -- re-running the same
  diff after a failure is a safe, idempotent upsert, not a duplicate
  insert) plus fail-loud propagation so a caller knows to retry rather
  than silently continuing on an incomplete sync.
"""

from __future__ import annotations

import structlog

from app.core.embedding.embedder import EMBEDDING_MODEL_NAME, NemotronEmbedder
from app.core.embedding.embedding_cache import EmbeddingCache, compute_chunk_hash
from app.core.processing.chunker import ASTChunker
from app.core.processing.document_processor import DocumentProcessor
from app.core.processing.metadata_generator import MetadataGenerator
from app.domain.enums import ProcessingStatus
from app.domain.models import Chunk, DiffManifest, Embedding, RepositoryManifest
from app.infra.vectorstore.chroma_client import ChromaClient

logger = structlog.get_logger("seis.core.processing")


class IncrementalSynchronizer:
    """Diff-based vector re-indexing for pushed commits (Task 18, §5.1, §6)."""

    def __init__(
        self,
        chroma_client: ChromaClient,
        document_processor: DocumentProcessor,
        chunker: ASTChunker,
        metadata_generator: MetadataGenerator,
        embedder: NemotronEmbedder,
        embedding_cache: EmbeddingCache,
    ) -> None:
        self._chroma = chroma_client
        self._document_processor = document_processor
        self._chunker = chunker
        self._metadata_generator = metadata_generator
        self._embedder = embedder
        self._embedding_cache = embedding_cache
        self._log = logger.bind(component="incremental_synchronizer")

    async def process_diff(self, repository_id: str, diff_manifest: DiffManifest) -> None:
        log = self._log.bind(repository_id=repository_id, commit_sha=diff_manifest.commit_sha)
        try:
            await self._delete_stale_chunks(repository_id, diff_manifest, log)
            await self._reindex_changed_files(repository_id, diff_manifest, log)
        except Exception:
            log.error("incremental_sync_failed")
            raise

        # Subtask 5 -- see module docstring for why this is a log event,
        # not an Express callback (Task 42, not yet built).
        log.info("repository_status_updated", status=ProcessingStatus.READY.value)

    async def _delete_stale_chunks(
        self, repository_id: str, diff_manifest: DiffManifest, log: structlog.BoundLogger
    ) -> None:
        stale_paths = {self._normalize_path(path) for path in diff_manifest.deleted_files}
        stale_paths.update(self._normalize_path(file.path) for file in diff_manifest.modified_files)
        for path in sorted(stale_paths):
            await self._chroma.delete_chunks_by_metadata(repository_id, {"file_path": path})
        log.info("stale_chunks_deleted", file_count=len(stale_paths))

    async def _reindex_changed_files(
        self, repository_id: str, diff_manifest: DiffManifest, log: structlog.BoundLogger
    ) -> None:
        files_to_index = [*diff_manifest.added_files, *diff_manifest.modified_files]
        if not files_to_index:
            log.info("no_files_to_reindex")
            return

        manifest = RepositoryManifest(
            repository_id=repository_id,
            workspace_id=diff_manifest.workspace_id,
            commit_sha=diff_manifest.commit_sha,
            files=files_to_index,
        )
        documents = self._document_processor.process_manifest(manifest)

        chunks: list[Chunk] = []
        for document in documents:
            for raw_chunk in self._chunker.chunk(document):
                metadata = self._metadata_generator.generate_metadata(document, raw_chunk)
                chunks.append(raw_chunk.model_copy(update={"metadata": metadata}))

        if not chunks:
            log.info("no_chunks_produced_from_diff", document_count=len(documents))
            return

        embeddings = await self._embed_chunks(chunks)
        await self._chroma.upsert_chunks(repository_id, chunks, embeddings)
        log.info("chunks_reindexed", document_count=len(documents), chunk_count=len(chunks))

    async def _embed_chunks(self, chunks: list[Chunk]) -> list[Embedding]:
        hashes = [compute_chunk_hash(chunk.content, EMBEDDING_MODEL_NAME) for chunk in chunks]
        cached = await self._embedding_cache.get_cached_embeddings(hashes)

        missing_indices = [index for index, h in enumerate(hashes) if h not in cached]
        if missing_indices:
            missing_chunks = [chunks[index] for index in missing_indices]
            new_vectors = await self._embedder.embed_chunks(missing_chunks)
            new_hash_vector_map = dict(
                zip((hashes[index] for index in missing_indices), new_vectors, strict=True)
            )
            await self._embedding_cache.cache_embeddings(new_hash_vector_map)
            cached.update(new_hash_vector_map)

        return [
            Embedding(chunk_id=chunk.chunk_id, vector=cached[h], model_version=EMBEDDING_MODEL_NAME)
            for chunk, h in zip(chunks, hashes, strict=True)
        ]

    @staticmethod
    def _normalize_path(path: str) -> str:
        # Matches MetadataGenerator's own file_path normalization
        # (Task 17) -- every chunk actually upserted has a lowercased,
        # forward-slash file_path, so deletion filters must match it.
        return path.replace("\\", "/").lower()
