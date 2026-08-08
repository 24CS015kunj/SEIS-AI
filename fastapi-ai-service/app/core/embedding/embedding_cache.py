"""Embedding Cache.

Content-hash-keyed cache preventing redundant embedding calls for
unchanged chunk content (§5.4).

Task 16: SHA-256(content + embedding model version) -> Redis-backed
vector cache. Filename/class-name note: the Phase-02 spec text names
``app.infra.cache.redis_client``; the actual frozen file (Task 10) is
``app.infra.cache.cache_client`` (``RedisClient``) -- used as-is here,
the same reconciliation already applied throughout this phase.

``RedisClient.get_cache``/``set_cache`` operate on plain strings only
(Task 10, by design -- see that module's docstring); this module is the
"caller that needs structured values" it defers serialization to, so
vectors are JSON-encoded/decoded here.
"""

from __future__ import annotations

import hashlib
import json

import structlog

from app.config.settings import Settings
from app.infra.cache.cache_client import RedisClient

logger = structlog.get_logger("seis.core.embedding")

_KEY_PREFIX = "embed"


def compute_chunk_hash(chunk_content: str, model_version: str) -> str:
    """SHA-256 hash of chunk content *and* embedding model version.

    Including ``model_version`` in the hash (§Best Practices) means a
    model upgrade naturally invalidates every existing cache entry --
    old and new vectors can never collide under the same key, so a
    model bump can never silently mix incompatible vector spaces
    (§Common Mistakes: never omit the model version from the key).
    """
    raw = f"{model_version}:{chunk_content}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class EmbeddingCache:
    """Redis-backed cache of embedding vectors, keyed by content hash
    (Task 16, §5.4).
    """

    def __init__(self, redis_client: RedisClient, settings: Settings) -> None:
        self._redis = redis_client
        self._ttl_seconds = settings.embedding_cache_ttl_seconds
        self._log = logger.bind(component="embedding_cache")

    @staticmethod
    def _key(content_hash: str) -> str:
        # Namespaced per app.infra.cache.cache_client's own documented
        # contract: it takes a bare key with no built-in prefixing, so
        # the caller (this module) owns the naming convention.
        return f"{_KEY_PREFIX}:{content_hash}"

    async def get_cached_embeddings(self, hashes: list[str]) -> dict[str, list[float]]:
        """Looks up every hash in ``hashes``. Misses are simply absent
        from the returned dict -- never represented as a ``None`` value.
        """
        results: dict[str, list[float]] = {}
        for content_hash in hashes:
            raw = await self._redis.get_cache(self._key(content_hash))
            if raw is not None:
                results[content_hash] = json.loads(raw)

        self._log.info(
            "embedding_cache_lookup",
            requested=len(hashes),
            hits=len(results),
            misses=len(hashes) - len(results),
        )
        return results

    async def cache_embeddings(self, hash_vector_map: dict[str, list[float]]) -> None:
        """Writes every ``(hash, vector)`` pair, each with the
        configured ``embedding_cache_ttl_seconds`` TTL.
        """
        for content_hash, vector in hash_vector_map.items():
            await self._redis.set_cache(
                self._key(content_hash), json.dumps(vector), self._ttl_seconds
            )

        self._log.info("embedding_cache_write", count=len(hash_vector_map))
