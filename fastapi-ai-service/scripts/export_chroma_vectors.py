"""Export actual Mongo repository collections to an ignored local rollback archive.

Run with the optional Chroma SDK (e.g. inside the existing API container).
Read-only source operation; synthetic/non-Mongo test collections are excluded.
"""

import json
import re
from pathlib import Path

from app.config.settings import get_settings
from app.core.embedding.embedder import EMBEDDING_MODEL_NAME
from app.domain.models import Chunk, Embedding
from app.infra.vectorstore.chroma_client import ChromaClient


def main() -> None:
    import chromadb

    settings = get_settings()
    client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    destination = Path(".migration")
    destination.mkdir(exist_ok=True)
    allowed_repositories = set(
        json.loads((destination / "repository_ids.json").read_text(encoding="utf-8-sig"))
    )
    manifest: list[dict[str, object]] = []
    skipped = 0
    for collection in client.list_collections():
        name = str(collection) if isinstance(collection, str) else collection.name
        if not re.fullmatch(r"repo_[0-9a-f]{24}", name) or name[5:] not in allowed_repositories:
            skipped += 1
            continue
        repo = name[5:]
        source = client.get_collection(name)
        expected = source.count()
        target = destination / f"{repo}.jsonl"
        count = 0
        with target.open("w", encoding="utf-8") as output:
            while count < expected:
                batch = source.get(
                    limit=64, offset=count, include=["documents", "metadatas", "embeddings"]
                )
                if not batch["ids"]:
                    raise RuntimeError(
                        "Source count changed during export; retry after draining jobs"
                    )
                for index, chunk_id in enumerate(batch["ids"]):
                    metadata = ChromaClient._metadata_from_chroma(batch["metadatas"][index])
                    if metadata.repository_id != repo:
                        raise RuntimeError("Source payload repository mismatch")
                    vector = batch["embeddings"][index].tolist()
                    if len(vector) != settings.embedding_dimension:
                        raise RuntimeError("Source embedding dimension differs from current model")
                    if metadata.embedding_model_version not in {
                        None,
                        settings.embedding_model_version,
                        EMBEDDING_MODEL_NAME,
                    }:
                        raise RuntimeError(
                            "Source embedding model version differs from current model"
                        )
                    chunk = Chunk(
                        chunk_id=chunk_id,
                        content=batch["documents"][index] or "",
                        metadata=metadata,
                    )
                    embedding = Embedding(
                        chunk_id=chunk_id,
                        vector=vector,
                        model_version=metadata.embedding_model_version
                        or settings.embedding_model_version,
                    )
                    output.write(
                        json.dumps(
                            {
                                "chunk": chunk.model_dump(mode="json"),
                                "embedding": embedding.model_dump(mode="json"),
                            }
                        )
                        + "\n"
                    )
                count += len(batch["ids"])
        if source.count() != expected:
            raise RuntimeError("Source changed during export; archive is not ready for import")
        manifest.append({"repository_id": repo, "count": count, "file": target.name})
    (destination / "manifest.json").write_text(
        json.dumps(
            {
                "embedding_dimension": settings.embedding_dimension,
                "collections": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"Exported {len(manifest)} actual repository collections, "
        f"{sum(int(item['count']) for item in manifest)} chunks; "
        f"skipped {skipped} fixture/unowned collections"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Chroma export failed ({type(exc).__name__}); source remains unchanged")
        raise SystemExit(1) from None
