"""Scoped Redis cutover preserving string values and their absolute expiry.

Run from the service directory with API writers stopped and queues drained.
Private archives live in ignored .migration/. Never overwrite a target key,
copy a lease, flush a database, or log keys/values/credentials.
"""

import argparse
import asyncio
import json
import os
import re
import time
from pathlib import Path

import redis.asyncio as redis

from app.config.settings import get_settings

DIRECTORY = Path(".migration")
ARCHIVE = DIRECTORY / "redis-state.json"


def allowed_key(key: str, repositories: set[str]) -> bool:
    if re.fullmatch(r"embed:[0-9a-f]{64}", key):
        return True
    match = re.fullmatch(
        r"(?:seis:repo-processing-status:|seis:evolution-report:)([0-9a-f]{24})", key
    )
    if match is None:
        match = re.fullmatch(r"conversation:([0-9a-f]{24}):.+", key)
    return bool(match and match[1] in repositories)


async def drained(client: redis.Redis) -> None:
    for name in ("seis:active-ingestions", "seis:pending-callback-deliveries"):
        if await client.scard(name):
            raise RuntimeError("Drain active ingestions and callback deliveries before cutover")
    async for _ in client.scan_iter(match="seis:repo-processing-lock:*", count=100):
        raise RuntimeError("An ingestion lease still exists; wait for safe drain")


async def export_state() -> None:
    repositories = set(
        json.loads((DIRECTORY / "repository_ids.json").read_text(encoding="utf-8-sig"))
    )
    client = redis.Redis.from_url(
        os.environ.get("REDIS_MIGRATION_SOURCE_URL", "redis://localhost:6379/0"),
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    records = []
    skipped = 0
    try:
        await drained(client)
        async for key in client.scan_iter(count=100):
            if not allowed_key(key, repositories):
                skipped += 1
                continue
            if await client.type(key) != "string":
                raise RuntimeError("An application key has an unsupported migration type")
            async with client.pipeline(transaction=True) as pipeline:
                pipeline.get(key)
                pipeline.pttl(key)
                captured = int(time.time() * 1000)
                value, ttl = await pipeline.execute()
            if value is None or ttl == -2:
                continue
            if key.startswith("seis:repo-processing-status:") and json.loads(value).get(
                "status"
            ) in {"pending", "queued", "processing"}:
                raise RuntimeError("Reconcile nonterminal repository status before migration")
            records.append(
                {"key": key, "value": value, "expires_at_ms": captured + ttl if ttl >= 0 else None}
            )
        await drained(client)
        ARCHIVE.write_text(
            json.dumps({"version": 1, "repositories": sorted(repositories), "records": records}),
            encoding="utf-8",
        )
        print(f"Archived {len(records)} scoped application keys; excluded {skipped} other keys")
    finally:
        await client.aclose()


async def import_state() -> None:
    settings = get_settings()
    if not settings.redis_url.startswith("rediss://"):
        raise RuntimeError("Configure the managed verified TLS REDIS_URL before import")
    archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    if archive.get("version") != 1:
        raise RuntimeError("Unsupported archive version")
    repositories = set(archive["repositories"])
    client = redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        ssl_cert_reqs="required",
        ssl_check_hostname=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        max_connections=4,
    )
    verified = 0
    expired = 0
    try:
        await client.ping()
        await drained(client)
        for record in archive["records"]:
            key, value, expiry = record["key"], record["value"], record["expires_at_ms"]
            if not allowed_key(key, repositories) or not isinstance(value, str):
                raise RuntimeError("Archive scope/type is invalid")
            remaining = expiry - int(time.time() * 1000) if expiry is not None else None
            if remaining is not None and remaining <= 0:
                expired += 1
                continue
            await client.set(key, value, nx=True, px=remaining)
            actual = await client.get(key)
            if actual is None and expiry is not None and int(time.time() * 1000) >= expiry:
                expired += 1
                continue
            if actual != value:
                raise RuntimeError("Target differs from archive; no existing key was overwritten")
            ttl = await client.pttl(key)
            if expiry is None:
                if ttl != -1:
                    raise RuntimeError("Persistent key expiry differs from archive")
            elif ttl == -2 and int(time.time() * 1000) >= expiry:
                expired += 1
                continue
            elif ttl < 0 or ttl > expiry - int(time.time() * 1000) + 2000:
                raise RuntimeError("Target key expiry was extended; inspect before cutover")
            verified += 1
        await drained(client)
        result = {"verified_keys": verified, "expired_keys": expired}
        (DIRECTORY / "redis-import-result.json").write_text(json.dumps(result), encoding="utf-8")
        print(f"Verified {verified} managed keys with matching values/expiry; {expired} expired")
    finally:
        await client.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "import"))
    parser.add_argument("--writers-stopped", action="store_true", required=True)
    args = parser.parse_args()
    try:
        asyncio.run(export_state() if args.action == "export" else import_state())
    except Exception as exc:
        print(f"Redis migration failed ({type(exc).__name__}); preserve both stores and inspect")
        raise SystemExit(1) from None
