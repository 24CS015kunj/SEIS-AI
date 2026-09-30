"""Import an explicit local Chroma archive to Qdrant without deleting either store.

Deterministic IDs make restarting after a partial import safe. Run only after
draining ingestion/callbacks and stopping writers; exact final counts and payload
hashes verify the migration. Archive contents are private and never logged.
"""

import asyncio
import hashlib
import json
import re
from pathlib import Path

from app.config.settings import get_settings
from app.domain.models import Chunk, Embedding
from app.infra.vectorstore.qdrant_client import QdrantVectorClient


def fingerprint(chunk: Chunk) -> str:
    payload = chunk.model_dump(mode="json")
    payload["metadata"].pop("indexed_at", None)
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


async def main() -> None:
    settings = get_settings()
    destination = Path(".migration").resolve()
    manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    if manifest["embedding_dimension"] != settings.embedding_dimension:
        raise RuntimeError("Archive embedding dimension does not match configured model")
    adapter = QdrantVectorClient(settings)
    migrated = 0
    try:
        if not await adapter.health_check():
            raise RuntimeError("Qdrant must be healthy before import")
        for entry in manifest["collections"]:
            repo = entry["repository_id"]
            if not re.fullmatch(r"[0-9a-f]{24}", repo) or entry["file"] != f"{repo}.jsonl":
                raise RuntimeError("Archive repository/file scope is invalid")
            source = destination / entry["file"]
            chunks: list[Chunk] = []
            embeddings: list[Embedding] = []
            expected: dict[str, str] = {}
            with source.open(encoding="utf-8") as records:
                for line in records:
                    record = json.loads(line)
                    chunk = Chunk.model_validate(record["chunk"])
                    embedding = Embedding.model_validate(record["embedding"])
                    if chunk.metadata.repository_id != repo or embedding.chunk_id != chunk.chunk_id:
                        raise RuntimeError("Archive chunk scope is invalid")
                    chunk.metadata.embedding_model_version = embedding.model_version
                    expected[chunk.chunk_id] = fingerprint(chunk)
                    chunks.append(chunk)
                    embeddings.append(embedding)
                    if len(chunks) == 64:
                        await adapter.upsert_chunks(repo, chunks, embeddings)
                        chunks, embeddings = [], []
            if chunks:
                await adapter.upsert_chunks(repo, chunks, embeddings)
            elif not expected:
                await adapter.get_or_create_collection(repo)
            info = await adapter._get_client().count(adapter._collection_name(repo), exact=True)
            if len(expected) != entry["count"] or info.count != len(expected):
                raise RuntimeError("Source/target point counts differ; retain archive and inspect")
            target = await adapter.get_all_chunks(repo, limit=len(expected) + 1)
            if {chunk.chunk_id: fingerprint(chunk) for chunk in target} != expected:
                raise RuntimeError("Target content/metadata differs from source archive")
            migrated += info.count
        (destination / "import-result.json").write_text(
            json.dumps(
                {
                    "verified_collections": len(manifest["collections"]),
                    "verified_chunks": migrated,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(
            f"Verified Qdrant migration: {len(manifest['collections'])} repositories, "
            f"{migrated} chunks, matching counts and content/metadata fingerprints"
        )
    finally:
        await adapter.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"Qdrant import failed ({type(exc).__name__}); retain archive and source for retry")
        raise SystemExit(1) from None
