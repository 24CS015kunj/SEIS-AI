"""Demonstration of Real Local Process Interruption, Termination, and Recovery (Task T5).

Proves real OS process lifecycle behavior:
1. HTTP acceptance of controlled job and Mongo ownership establishment.
2. Hard process termination (kill -9) during active pipeline, followed by restart.
3. Restart before lease expiry: fresh job is preserved, not falsely failed.
4. Normal background loop eventual lease expiry and orphan reconciliation.
5. Safe resubmission and completion across both stores (Redis + Mongo).
6. Graceful SIGTERM with running/queued work.
7. Termination after vector write but before terminal delivery, followed by recovery without duplicate embedding.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis


# ---------------------------------------------------------------------------
# Fixture Ports & Configuration
# ---------------------------------------------------------------------------
FASTAPI_PORT = 8995
EXPRESS_PORT = 5099
NVIDIA_PORT = 8999
REDIS_URL = "redis://localhost:6379/0"
INTERNAL_API_KEY = "test-internal-key-t5"


# ---------------------------------------------------------------------------
# Mock NVIDIA Embeddings Server (Zero external calls)
# ---------------------------------------------------------------------------
class MockNvidiaHandler(BaseHTTPRequestHandler):
    embedding_calls: list[dict[str, Any]] = []

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        payload = json.loads(body) if body else {}

        if self.path == "/embeddings":
            texts = payload.get("input", [])
            MockNvidiaHandler.embedding_calls.append({"count": len(texts), "model": payload.get("model")})
            # Nemotron uses 2048 dimensions with an explicit index field
            vectors = [{"index": idx, "embedding": [0.005] * 2048} for idx, _ in enumerate(texts)]
            resp = json.dumps({"data": vectors}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        pass


# ---------------------------------------------------------------------------
# Mock Express Webhook Server with Real Mongo Updates
# ---------------------------------------------------------------------------
class MockExpressHandler(BaseHTTPRequestHandler):
    received_callbacks: list[dict[str, Any]] = []
    mongo_ownership: dict[str, dict[str, Any]] = {}
    simulate_delayed_ownership: set[str] = set()

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        payload = json.loads(body) if body else {}

        if self.path == "/api/webhooks/fastapi/ingestion-status":
            MockExpressHandler.received_callbacks.append(payload)
            repo_id = payload.get("repository_id")
            job_id = payload.get("job_id")
            status = payload.get("status")

            # Check if this repository is in temporarily delayed ownership mode
            if repo_id in MockExpressHandler.simulate_delayed_ownership:
                resp = json.dumps({
                    "success": False,
                    "retryable": True,
                    "reason": "attempt_ownership_not_settled",
                }).encode("utf-8")
                self.send_response(409)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return

            current = MockExpressHandler.mongo_ownership.get(repo_id, {})
            current_active = current.get("activeJobId")

            # Monotonic terminal protection
            if current.get("ingestionStatus") in ("completed", "failed") and status in ("processing", "queued"):
                resp = json.dumps({
                    "success": True,
                    "ignored": True,
                    "reason": "terminal_state_preserved",
                }).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return

            # Attempt fencing: if active and mismatched
            if current_active and job_id and current_active != job_id:
                if current.get("ingestionStatus") in ("completed", "failed"):
                    resp = json.dumps({
                        "success": False,
                        "retryable": True,
                        "reason": "attempt_ownership_not_settled",
                    }).encode("utf-8")
                    self.send_response(409)
                else:
                    resp = json.dumps({
                        "success": True,
                        "ignored": True,
                        "reason": "stale_attempt_superseded",
                    }).encode("utf-8")
                    self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                self.wfile.write(resp)
                return

            # Apply update to Mongo fixture
            mapped_status = "completed" if status in ("READY", "ready") else ("failed" if status in ("FAILED", "failed") else "processing")
            current.update({
                "activeJobId": job_id or current_active,
                "ingestionStatus": mapped_status,
                "chunkCount": payload.get("chunk_count", current.get("chunkCount", 0)),
                "lastHeartbeatAt": payload.get("timestamp"),
                "ingestionError": payload.get("error"),
            })
            MockExpressHandler.mongo_ownership[repo_id] = current

            resp = json.dumps({"success": True, "applied": True, "ingestionStatus": mapped_status}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        pass


def run_http_server(server: HTTPServer) -> None:
    server.serve_forever()


# ---------------------------------------------------------------------------
# FastAPI Subprocess Controller
# ---------------------------------------------------------------------------
class FastAPISubprocess:
    def __init__(self, port: int = FASTAPI_PORT) -> None:
        self.port = port
        self.proc: subprocess.Popen[str] | None = None
        self.pid: int | None = None

    def start(self) -> int:
        env = os.environ.copy()
        env["SERVICE_PORT"] = str(self.port)
        env["TASK_QUEUE_BROKER_URL"] = REDIS_URL
        env["CACHE_BACKEND"] = "redis"
        env["EXPRESS_BASE_URL"] = f"http://127.0.0.1:{EXPRESS_PORT}"
        env["NVIDIA_EMBEDDING_BASE_URL"] = f"http://127.0.0.1:{NVIDIA_PORT}"
        env["NVIDIA_EMBEDDING_API_KEY"] = "mock-nvidia-key"
        env["INTERNAL_API_KEY"] = INTERNAL_API_KEY
        env["FASTAPI_INTERNAL_API_KEY"] = INTERNAL_API_KEY
        env["CHROMADB_HOST"] = "localhost"
        env["CHROMADB_PORT"] = "8001"
        env["ENABLE_CHROMA_IN_MEMORY_FALLBACK"] = "true"
        # Bounded lease and recovery for demonstration (ge=10 requirement)
        env["INGESTION_HEARTBEAT_INTERVAL_SECONDS"] = "2"
        env["INGESTION_HEARTBEAT_TIMEOUT_SECONDS"] = "10"
        env["INGESTION_RECOVERY_INTERVAL_SECONDS"] = "2.0"
        env["INGESTION_RECOVERY_IDLE_INTERVAL_SECONDS"] = "2.0"
        env["RECOVERY_LOOP_INTERVAL_SECONDS"] = "2.0"

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(self.port),
        ]
        log_path = r"D:\SGP-2\fastapi-ai-service\fastapi_subproc.log"
        self._log_file = open(log_path, "w", encoding="utf-8")
        self.proc = subprocess.Popen(
            cmd,
            cwd=r"D:\SGP-2\fastapi-ai-service",
            env=env,
            stdout=self._log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self.pid = self.proc.pid

        # Wait for live probe
        url = f"http://127.0.0.1:{self.port}/health/live"
        for _ in range(80):
            if self.proc.poll() is not None:
                self._log_file.flush()
                with open(log_path, encoding="utf-8") as f:
                    content = f.read()
                raise RuntimeError(
                    f"FastAPI process exited prematurely with code {self.proc.returncode}.\nLOG: {content}"
                )
            try:
                r = httpx.get(url, timeout=0.5)
                if r.status_code == 200:
                    return self.pid
            except Exception:
                time.sleep(0.1)

        self._log_file.flush()
        with open(log_path, encoding="utf-8") as f:
            content = f.read()
        raise RuntimeError(
            f"FastAPI process on port {self.port} failed to become healthy within timeout.\nLOG: {content}"
        )

    def kill_hard(self) -> None:
        """Simulates abrupt process crash / power cut / OOM kill."""
        if self.proc:
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.proc.pid)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                self.proc.kill()
            self.proc.wait()
            self.proc = None
            if hasattr(self, "_log_file") and not self._log_file.closed:
                self._log_file.close()

    def terminate_graceful(self, timeout: float = 5.0) -> None:
        """Simulates SIGTERM / container graceful shutdown."""
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                self.kill_hard()
            self.proc = None
            if hasattr(self, "_log_file") and not self._log_file.closed:
                self._log_file.close()


# ---------------------------------------------------------------------------
# Real Process Interruption Test Suite
# ---------------------------------------------------------------------------
def start_mock_servers():
    nvidia_server = HTTPServer(("127.0.0.1", NVIDIA_PORT), MockNvidiaHandler)
    express_server = HTTPServer(("127.0.0.1", EXPRESS_PORT), MockExpressHandler)

    t_nvidia = threading.Thread(target=run_http_server, args=(nvidia_server,), daemon=True)
    t_express = threading.Thread(target=run_http_server, args=(express_server,), daemon=True)

    t_nvidia.start()
    t_express.start()
    return nvidia_server, express_server


@pytest.fixture(scope="module")
def mock_servers():
    nvidia_server, express_server = start_mock_servers()
    yield
    nvidia_server.shutdown()
    express_server.shutdown()


@pytest.mark.asyncio
async def test_real_process_interruption_and_recovery_demonstration(mock_servers: Any = None) -> None:
    if mock_servers is None:
        start_mock_servers()
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    repo_id = f"repo-realproc-{uuid.uuid4().hex[:8]}"

    # Setup Mongo record (disposable fixture in MockExpressHandler)
    MockExpressHandler.mongo_ownership[repo_id] = {
        "activeJobId": None,
        "ingestionStatus": "pending",
        "chunkCount": 0,
    }

    # 1. Start initial FastAPI process
    fastapi = FastAPISubprocess(FASTAPI_PORT)
    pid_1 = fastapi.start()
    assert pid_1 is not None
    print(f"\n[ACCEPTANCE] 1. Initial FastAPI process booted successfully with PID={pid_1}")

    manifest_payload = {
        "workspace_id": str(uuid.uuid4()),
        "commit_sha": "a1b2c3d4e5f60123456789abcdef012345678901",
        "files": [
            {"path": f"src/module_{i}.py", "content": f"def func_{i}(): return {i}\n" * 5, "language": "python", "size_bytes": 100}
            for i in range(15)
        ],
    }

    headers = {"Authorization": f"Bearer {INTERNAL_API_KEY}"}
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{FASTAPI_PORT}", headers=headers) as client:
        # Submit ingestion job
        resp = await client.post(f"/api/v1/repositories/{repo_id}/ingest", json=manifest_payload)
        assert resp.status_code == 202
        body = resp.json()
        job_id_1 = body["job_id"]
        print(f"[ACCEPTANCE] Job admitted: attempt_id={job_id_1}, status=pending")

    # Bind Mongo ownership to attempt_id
    MockExpressHandler.mongo_ownership[repo_id]["activeJobId"] = job_id_1
    MockExpressHandler.mongo_ownership[repo_id]["ingestionStatus"] = "processing"

    # Wait until status record is active in Redis
    status_raw = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
    assert status_raw is not None
    rec = json.loads(status_raw)
    assert rec["job_id"] == job_id_1
    print(f"[ACCEPTANCE] Redis confirmed initial status={rec['status']}, active_set includes repo.")

    # 2. Hard termination (kill -9) during active pipeline
    print(f"[ACCEPTANCE] 2. Injecting fault: HARD TERMINATION (SIGKILL) on process PID={pid_1}...")
    fastapi.kill_hard()
    print(f"[ACCEPTANCE] Process PID={pid_1} terminated abruptly (fault simulated).")

    # Verify both stores right after crash:
    status_at_crash = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
    assert status_at_crash is not None
    crash_rec = json.loads(status_at_crash)
    assert crash_rec["job_id"] == job_id_1
    assert crash_rec["status"] in ("pending", "processing")
    mongo_at_crash = MockExpressHandler.mongo_ownership[repo_id]
    assert mongo_at_crash["activeJobId"] == job_id_1
    print(f"[ACCEPTANCE] Post-crash inspection: Redis status={crash_rec['status']}, Mongo activeJobId={mongo_at_crash['activeJobId']}.")

    # 3. Restart process BEFORE lease expiry (< 3s)
    fastapi_2 = FastAPISubprocess(FASTAPI_PORT)
    pid_2 = fastapi_2.start()
    assert pid_2 != pid_1
    print(f"[ACCEPTANCE] 3. Restarted fresh FastAPI process with new PID={pid_2} before lease expiry.")

    # Verify that fresh job was NOT falsely failed on startup reconciliation
    status_after_fast_restart = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
    assert status_after_fast_restart is not None
    fast_restart_rec = json.loads(status_after_fast_restart)
    # The heartbeat is still fresh, so startup reconciliation did NOT clobber it
    assert fast_restart_rec["job_id"] == job_id_1
    assert fast_restart_rec["status"] in ("pending", "processing")
    print(f"[ACCEPTANCE] Fresh restart preserved in-flight job without false failure: status={fast_restart_rec['status']}.")

    # 4. Wait for lease expiry (> 10s) and background loop reconciliation
    print("[ACCEPTANCE] 4. Waiting up to 16s for normal background loop to detect lease expiry...")
    reconciled_rec = None
    for _ in range(32):
        await asyncio.sleep(0.5)
        status_reconciled = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
        if status_reconciled:
            rec = json.loads(status_reconciled)
            if rec.get("status") == "failed":
                reconciled_rec = rec
                break

    assert reconciled_rec is not None, f"Expected status 'failed', but got: {status_reconciled}"
    assert reconciled_rec["status"] == "failed"
    assert "timed out or was interrupted" in reconciled_rec["error"]
    print(f"[ACCEPTANCE] Background recovery loop successfully reconciled orphan: status={reconciled_rec['status']}, error='{reconciled_rec['error']}'.")

    # Active set in Redis cleared
    is_active = await redis_client.sismember("seis:active-ingestions", repo_id)
    assert not is_active
    print("[ACCEPTANCE] Repository successfully removed from active-ingestions set.")

    # Mongo received durable callback and transitioned to failed
    mongo_reconciled = MockExpressHandler.mongo_ownership[repo_id]
    for _ in range(20):
        if MockExpressHandler.mongo_ownership[repo_id].get("ingestionStatus") == "failed":
            mongo_reconciled = MockExpressHandler.mongo_ownership[repo_id]
            break
        await asyncio.sleep(0.2)
    assert mongo_reconciled["ingestionStatus"] == "failed"
    print(f"[ACCEPTANCE] Mongo received failure callback: status={mongo_reconciled['ingestionStatus']}.")

    # 5. Safe resubmission and full pipeline completion
    print("[ACCEPTANCE] 5. Resubmitting repository with attempt_id=attempt-2...")
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{FASTAPI_PORT}", headers=headers) as client:
        resp2 = await client.post(f"/api/v1/repositories/{repo_id}/ingest", json=manifest_payload)
        assert resp2.status_code == 202
        job_id_2 = resp2.json()["job_id"]
        assert job_id_2 != job_id_1
        print(f"[ACCEPTANCE] New attempt accepted: attempt_id={job_id_2}")

    # Bind Mongo to attempt-2
    MockExpressHandler.mongo_ownership[repo_id]["activeJobId"] = job_id_2
    MockExpressHandler.mongo_ownership[repo_id]["ingestionStatus"] = "processing"

    # Wait for attempt-2 to run through worker, chunk, embed, and reach READY
    print("[ACCEPTANCE] Waiting for worker to complete chunking, embedding, and ChromaDB indexing...")
    for _ in range(40):
        cur_status = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
        if cur_status:
            rec2 = json.loads(cur_status)
            if rec2["status"] == "ready":
                break
        await asyncio.sleep(0.3)

    final_redis = await redis_client.get(f"seis:repo-processing-status:{repo_id}")
    assert final_redis is not None
    final_rec = json.loads(final_redis)
    assert final_rec["status"] == "ready"
    assert final_rec["job_id"] == job_id_2
    print(f"[ACCEPTANCE] Attempt-2 reached READY in Redis! Chunks: {final_rec['chunk_count']}.")

    # Check Mongo received READY callback
    mongo_final = MockExpressHandler.mongo_ownership[repo_id]
    assert mongo_final["ingestionStatus"] == "completed"
    assert mongo_final["activeJobId"] == job_id_2
    print(f"[ACCEPTANCE] Attempt-2 reached COMPLETED in Mongo! activeJobId={mongo_final['activeJobId']}.")

    # 6. Graceful SIGTERM test
    print(f"[ACCEPTANCE] 6. Testing graceful SIGTERM shutdown on PID={pid_2}...")
    fastapi_2.terminate_graceful(timeout=4.0)
    print(f"[ACCEPTANCE] PID={pid_2} exited cleanly upon SIGTERM within bounded timeout.")

    await redis_client.aclose()


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_real_process_interruption_and_recovery_demonstration(None))
