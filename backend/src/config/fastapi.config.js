/**
 * FastAPI AI-service integration configuration.
 *
 * Read live from process.env on every call (not cached into a
 * module-level object at import time) -- matching the existing
 * convention in github.service.js, where functions like
 * exchangeCodeForToken() read process.env.GITHUB_CLIENT_ID directly at
 * call time rather than from a frozen config snapshot. This also keeps
 * the module test-friendly: tests can set process.env per-case without
 * needing to reload the module.
 *
 * No value is ever hardcoded here. baseUrl/internalApiKey have no
 * fallback -- an absent baseUrl is a genuine configuration error the
 * caller must surface, not paper over with a guessed default.
 */

const toPositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getFastapiConfig = () => ({
    baseUrl: process.env.FASTAPI_BASE_URL || null,
    internalApiKey: process.env.FASTAPI_INTERNAL_API_KEY || null,
    timeoutMs: toPositiveInt(process.env.FASTAPI_TIMEOUT_MS, 15000),
    // Repository chat (Task 59) is a synchronous, LLM-latency-bound request
    // (retrieve -> rerank -> generate -> cite), not a fire-and-forget
    // submission like ingestion. Must stay comfortably above FastAPI's own
    // internal generation timeout (nemotron_timeout_ms, 45s as of Task 60 --
    // app/config/settings.py; was gemini_timeout_ms, 60s, before the
    // Gemini->Nemotron 3 Ultra migration) plus retrieval/rerank overhead
    // (~2-3s observed) -- otherwise Express would cut the request off
    // before FastAPI's own timeout ever gets a chance to return a clean,
    // real error. 75000 already clears the new, lower 45s budget with more
    // headroom than before, so it is left unchanged.
    chatTimeoutMs: toPositiveInt(process.env.FASTAPI_CHAT_TIMEOUT_MS, 75000),
    maxRetries: toPositiveInt(process.env.FASTAPI_MAX_RETRIES, 3),
    retryBaseDelayMs: toPositiveInt(process.env.FASTAPI_RETRY_BASE_DELAY_MS, 500),
});
