"""Typed, environment-driven application configuration.

Implements the configuration hierarchy defined in
docs/week1-ai-system-design.md §19.1 (Code Defaults -> .env ->
Deployment Env Vars) using Pydantic Settings, with the environment
variable catalogue from §19.2. Every field name matches an entry in
the frozen ``.env.example`` (Task 2) exactly -- no environment
variable is renamed, added, or removed here.
"""

from collections.abc import Callable
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment (§19.8). Drives which secrets are required."""

    DEVELOPMENT = "development"
    TESTING = "testing"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Process-wide configuration, resolved once at startup.

    Construct via :func:`get_settings`, never directly -- the singleton
    wrapper is what guarantees environment parsing/validation happens
    exactly once per process (§19.1).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        # A stray/misspelled key in `.env` fails startup immediately
        # instead of being silently ignored -- the same "fail loudly on
        # mismatch" principle as the config schema versioning in §19.10.
        # Safe against unrelated OS environment variables (PATH, TEMP,
        # ...): pydantic-settings only pulls in `.env`/process-env values
        # matching a declared field name, so nothing outside this model's
        # fields is ever presented to `extra` validation.
        extra="forbid",
    )

    # --- Application identity (not in .env.example -- code defaults only;
    # overridable via APP_NAME/APP_VERSION if a deployment ever needs to,
    # but no env var is required). Replaces the constants that lived in
    # app.main and app.api.v1.health_routes through Task 3. ---
    app_name: str = "SEIS AI Service"
    app_version: str = "0.1.0"

    # --- Service (§19.2) ---
    service_env: Environment = Environment.DEVELOPMENT
    service_port: int = Field(default=8000, ge=1024, le=65535)
    # Secret — service-to-service auth token Express must present (§26.1-§26.2).
    internal_api_key: SecretStr = SecretStr("")
    # Express gateway base URL for webhook callbacks (§11.2)
    express_base_url: str = "http://localhost:5000"

    # --- Generation — NVIDIA hosted Nemotron 3 Ultra (Task 60, ADR-008).
    # Replaces Gemini as the answer-generation LLM: real Gemini
    # generate_text calls were live-observed (Task 59) timing out around
    # 30s under normal repository-chat load with no reliable fix short of
    # changing provider. Live-verified against NVIDIA's real hosted API
    # before this default was chosen (not assumed from docs):
    # `nvidia/nemotron-3-ultra-550b-a55b` responds to a realistic
    # ~4200-token grounded chat prompt in ~3-6s. Reuses `nvidia_api_key`
    # (already used for embeddings/reranking) -- no separate secret. ---
    nemotron_model_name: str = "nvidia/nemotron-3-ultra-550b-a55b"
    nemotron_max_output_tokens: int = Field(default=2048, gt=0)
    # Live-verified (Task 60): real generate_text calls against the
    # hosted API, including through the full repository-chat pipeline,
    # ranged 3-10s. One real E2E run also hit a genuine full-timeout
    # stall (zero response bytes) that succeeded immediately on retry --
    # see NemotronGateway's own docstring/`_run_with_retry` for that
    # finding and the single bounded timeout-retry it added in response.
    # 30s leaves ~3x headroom above the slowest observed success, and a
    # worst case of two attempts (60s total) still comfortably clears
    # the Express chat proxy's 75s budget
    # (backend/src/config/fastapi.config.js) -- unlike a blind inflation
    # to cover every possible stall in one attempt.
    nemotron_timeout_ms: int = Field(default=30_000, gt=0)

    # --- Embedding — NVIDIA Nemotron-3-Embed-1B, hosted API (ADR-007). ---
    # Secret — never logged, never committed. Empty by default so import/
    # boot never fails; only an actual embed call raises if this is blank.
    nvidia_embedding_api_key: SecretStr = SecretStr("")
    # --- Generation — NVIDIA Nemotron-3-Ultra-550B-A55B, hosted API (Task 60). ---
    nvidia_chat_api_key: SecretStr = SecretStr("")
    # Legacy fallback — single NVIDIA_API_KEY for backward compatibility.
    nvidia_api_key: SecretStr = SecretStr("")
    # NVIDIA's documented hosted-inference base URL (verified against
    # https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b
    # and https://build.nvidia.com/nvidia/nemotron-3-embed-1b — the
    # OpenAI-compatible NIM base host every current example/curl snippet
    # uses). Configurable so a future self-hosted NIM deployment can
    # override it without a code change; this default is correct for the
    # hosted API this task requires.
    nvidia_embedding_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_embedding_timeout_ms: int = Field(default=30_000, gt=0)
    # Generation host, live-verified (Task 60) to be the SAME host as
    # embeddings above (unlike reranking's separate ai.api.nvidia.com
    # host) -- kept as its own setting anyway, not a reused reference to
    # nvidia_embedding_base_url, for the same "a model/endpoint family
    # gets its own setting even when a host happens to coincide" reason
    # nvidia_reranking_base_url already established.
    nvidia_generation_base_url: str = "https://integrate.api.nvidia.com/v1"
    # Model id sent as the request's "model" field. The actual value read
    # by NemotronEmbedder is the module constant of the same name in
    # app/core/embedding/embedder.py (pinned, not settings-driven — see
    # that module's docstring); kept here too so `.env`/`.env.example`
    # accurately document the model in use rather than naming the retired
    # Gemini model or an unrelated Sentence-Transformers fallback.
    embedding_model_name: str = "nvidia/nemotron-3-embed-1b"
    embedding_model_version: str = "v1"
    # Verified from NVIDIA's model card and NeMo Retriever API reference
    # (both cited above) — Nemotron-3-Embed-1B's native output size.
    # Never assumed/guessed; used to validate every returned vector.
    embedding_dimension: int = Field(default=2048, gt=0)
    embedding_batch_size: int = Field(default=32, gt=0)
    embedding_cache_ttl_seconds: int = Field(default=604_800, ge=0)

    # --- Reranking — NVIDIA hosted cross-encoder (Task 24). A different
    # host from the embeddings base URL above: verified live that this
    # model's hosted reranking endpoint is served from `ai.api.nvidia.com`
    # under a per-model path, not `integrate.api.nvidia.com/v1/ranking`
    # (which 404s for this model) — see app/core/retrieval/rag_optimizer.py's
    # module docstring for the full verification trail. Uses
    # `nvidia_embedding_api_key`/`nvidia_embedding_timeout_ms`.
    nvidia_reranking_base_url: str = "https://ai.api.nvidia.com"

    # --- Vector Store (§19 — connection only, no indexing this task) ---
    chroma_host: str = "localhost"
    chroma_port: int = Field(default=8001, ge=1, le=65535)
    chroma_persist_dir: Path = Path("./.chroma")

    # --- Queue / Cache (§19.2) ---
    task_queue_broker_url: str = "redis://localhost:6379/0"
    cache_backend: Literal["memory", "redis"] = "memory"
    cache_ttl_seconds: int = Field(default=3600, ge=0)

    # --- Conversation history (Task 65) -- own settings, not a reuse of
    # cache_ttl_seconds above: conversation lifetime is a distinct concern
    # from generic response caching, same "a model/endpoint family gets
    # its own setting even when a value happens to coincide" reasoning
    # NVIDIA_RERANKING_BASE_URL's own comment already establishes. ---
    # 24h: long enough to resume a real coding-chat session later the same
    # day, short enough to bound Redis memory growth automatically.
    conversation_history_ttl_seconds: int = Field(default=86_400, ge=0)
    # Maximum conversation turns sent to LLM per request (§20).
    max_history_turns: int = Field(default=10, ge=0)
    # Messages, not turns (1 turn = 2 messages: user + assistant) -- 12
    # messages = 6 prior turns. Bounds both what's persisted (oldest
    # messages are dropped first) and what's sent to Nemotron 3 Ultra per
    # call: at a few hundred tokens per turn this adds low-single-digit-
    # thousands of tokens at most, comfortably inside Nemotron 3 Ultra's
    # context window and on top of ContextBuilder's own separate 4000-
    # token repository-context budget.
    conversation_history_max_messages: int = Field(default=12, gt=0)

    # --- Retriever (§19.6 — defaults, no retrieval logic yet) ---
    retriever_default_top_k: int = Field(default=8, gt=0)
    # Deliberately low: this is a recall-stage cutoff, not the precision
    # filter. Live-verified against a real repository (Task 59) that a
    # genuinely on-topic match can score as low as ~0.34 with real Nemotron
    # embeddings, while RAGOptimizer's cross-encoder reranker (which always
    # runs afterward for chat) reliably separates true matches (~0.98) from
    # noise (~0.03-0.15) once given the chance to see them. 0.35 silently
    # dropped legitimate matches before reranking ever ran.
    retriever_similarity_threshold: float = Field(default=0.15, ge=0.0, le=1.0)

    # --- Logging (§19.8) ---
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_sink: Literal["stdout", "file"] = "stdout"
    log_sampling_rate: float = Field(default=1.0, ge=0.0, le=1.0)

    # --- Feature Flags (§19.9) ---
    feature_query_rewrite: bool = True
    feature_reranking: bool = True
    feature_response_cache: bool = True
    feature_streaming_chat: bool = False
    feature_evolution_analysis: bool = True
    feature_incremental_reindex: bool = True

    @property
    def is_production(self) -> bool:
        return self.service_env is Environment.PRODUCTION

    @property
    def chroma_url(self) -> str:
        """Convenience accessor for Task 10's ChromaDB client."""
        return f"http://{self.chroma_host}:{self.chroma_port}"

    @model_validator(mode="after")
    def _fallback_legacy_nvidia_api_key(self) -> "Settings":
        """Fallback for legacy NVIDIA_API_KEY if specific keys are unconfigured."""
        legacy_key = self.nvidia_api_key.get_secret_value()
        if legacy_key:
            if not self.nvidia_embedding_api_key.get_secret_value():
                self.nvidia_embedding_api_key = self.nvidia_api_key
            if not self.nvidia_chat_api_key.get_secret_value():
                self.nvidia_chat_api_key = self.nvidia_api_key
        return self

    @model_validator(mode="after")
    def _require_secrets_in_production(self) -> "Settings":
        """Configuration validation (§19, §26.3): production may never
        boot with empty secrets. Development/testing/staging are allowed
        to run with blank secrets so a fresh clone works immediately
        against `.env.example` defaults for everything except real LLM
        calls.
        """
        if self.service_env is not Environment.PRODUCTION:
            return self

        required: dict[str, SecretStr] = {
            "INTERNAL_API_KEY": self.internal_api_key,
            "NVIDIA_EMBEDDING_API_KEY": self.nvidia_embedding_api_key,
            "NVIDIA_CHAT_API_KEY": self.nvidia_chat_api_key,
        }
        missing = [name for name, value in required.items() if not value.get_secret_value()]
        if missing:
            raise ValueError(
                "Missing required secret(s) for SERVICE_ENV=production: "
                f"{', '.join(missing)}. Set them via the deployment platform's "
                "secret store (§26.3) -- never in a committed file."
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Returns the process-wide :class:`Settings` singleton.

    ``lru_cache`` guarantees ``Settings()`` -- and therefore `.env`
    parsing and the production-secrets validator above -- runs exactly
    once per process, not on every call site (§19.1). Task 8 wraps this
    in a FastAPI ``Depends()`` dependency for request handlers; call it
    directly (as ``app.main`` does) for app-construction-time config.

    Tests that need different settings (Task 13) must mutate the
    environment first, then call ``get_settings.cache_clear()`` before
    the next call -- otherwise the cached instance from an earlier test
    is returned unchanged.
    """
    return Settings()


# Exposed for type-checking call sites that want the singleton's type
# without importing `lru_cache` semantics into their own module.
SettingsFactory = Callable[[], Settings]
