/**
 * HTTP client for the FastAPI AI service's repository ingestion endpoint
 * (Task 36: POST /api/v1/repositories/{repository_id}/ingest).
 *
 * Deliberately thin: builds the request exactly to Task 36's schema,
 * retries only transient failures, and returns a plain result object
 * rather than throwing -- callers (ingestionPreparation.service.js)
 * decide what a failed batch means for the overall ingestion result,
 * this module only knows about one HTTP call at a time.
 */

import axios from "axios";
import { getFastapiConfig } from "../config/fastapi.config.js";

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Per requirement #15: retry network errors, timeouts, and 5xx only.
 * Never retry 4xx (400/401/403/404/422/...) -- those mean the request
 * itself was wrong, and retrying an unchanged request produces the
 * same rejection every time.
 */
export const isRetryableError = (error) => {
    if (error.response) {
        return RETRYABLE_STATUS_CODES.has(error.response.status);
    }
    // No response at all: network error, DNS failure, connection refused,
    // or axios's own ECONNABORTED timeout -- all transient by nature.
    return true;
};

const classifyFailure = (error) => {
    if (error.response) {
        return {
            statusCode: error.response.status,
            reason: error.response.data?.error?.message || error.response.data?.message || error.message,
            errorCode: error.response.data?.error?.code || null,
        };
    }
    if (error.code === "ECONNABORTED") {
        return { statusCode: null, reason: `Request timed out: ${error.message}`, errorCode: "TIMEOUT" };
    }
    return { statusCode: null, reason: `Network error: ${error.message}`, errorCode: "NETWORK_ERROR" };
};

/**
 * Response shape is trusted only after this check -- a 2xx response
 * missing job_id/status is treated as a failure, never silently passed
 * through as a "success" with undefined fields (§Task 37 instruction 18
 * "malformed FastAPI response").
 */
const isValidIngestResponse = (data) =>
    Boolean(data) && typeof data.job_id === "string" && typeof data.status === "string";

/**
 * Submits one manifest (one batch) to Task 36's ingestion endpoint.
 *
 * @param {string} repositoryId
 * @param {{workspace_id: string, commit_sha: string, files: Array}} manifest
 * @param {object} [options]
 * @param {object} [options.httpClient] - injectable axios-compatible client (tests only)
 * @param {object} [options.config] - injectable config (tests only)
 * @returns {Promise<{success: true, jobId: string, status: string, repositoryId: string, submittedAt: string} |
 *                    {success: false, statusCode: number|null, errorCode: string|null, reason: string, retryable: boolean, attempts: number}>}
 */
export const submitIngestionManifest = async (repositoryId, manifest, options = {}) => {
    const config = options.config || getFastapiConfig();
    const httpClient = options.httpClient || axios;

    if (!config.baseUrl) {
        return {
            success: false,
            statusCode: null,
            errorCode: "MISSING_CONFIG",
            reason: "FASTAPI_BASE_URL is not configured.",
            retryable: false,
            attempts: 0,
        };
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/ingest`;
    const headers = { "Content-Type": "application/json" };
    // Mirrors FastAPI's own verify_service_token dev-mode passthrough: if no
    // key is configured on this side either, send the request without an
    // Authorization header rather than fabricating one.
    if (config.internalApiKey) {
        headers.Authorization = `Bearer ${config.internalApiKey}`;
    }

    let lastError;
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
        try {
            const response = await httpClient.post(url, manifest, {
                headers,
                timeout: config.timeoutMs,
            });

            if (!isValidIngestResponse(response.data)) {
                return {
                    success: false,
                    statusCode: response.status,
                    errorCode: "MALFORMED_RESPONSE",
                    reason: "FastAPI response did not contain the expected job_id/status fields.",
                    retryable: false,
                    attempts: attempt,
                };
            }

            return {
                success: true,
                jobId: response.data.job_id,
                status: response.data.status,
                repositoryId: response.data.repository_id || repositoryId,
                submittedAt: response.data.submitted_at,
            };
        } catch (error) {
            lastError = error;
            const retryable = isRetryableError(error);
            const isLastAttempt = attempt === config.maxRetries + 1;

            if (!retryable || isLastAttempt) {
                const { statusCode, reason, errorCode } = classifyFailure(error);
                return {
                    success: false,
                    statusCode,
                    errorCode,
                    reason,
                    retryable,
                    attempts: attempt,
                };
            }

            // Exponential backoff: baseDelay * 2^(attempt-1).
            await sleep(config.retryBaseDelayMs * 2 ** (attempt - 1));
        }
    }

    // Unreachable in practice (the loop always returns), kept only so the
    // function has an explicit terminal value if maxRetries is ever 0
    // and the loop body is skipped entirely by some future refactor.
    const { statusCode, reason, errorCode } = classifyFailure(lastError);
    return { success: false, statusCode, errorCode, reason, retryable: false, attempts: 0 };
};

/**
 * Sends one chat message to the real Repository Chat pipeline (Task 54/55:
 * POST /api/v1/repositories/{repository_id}/chat -- retrieve -> rerank ->
 * build context -> prompt -> Gemini -> cite).
 *
 * Unlike submitIngestionManifest, this is never retried: an LLM call is
 * neither cheap nor idempotent, so a transient failure is surfaced to the
 * caller as-is rather than silently re-invoked (which would risk a second
 * real Gemini call for the same question).
 *
 * @param {string} repositoryId
 * @param {{message: string, conversation_id: string}} payload
 * @param {object} [options]
 * @param {object} [options.httpClient] - injectable axios-compatible client (tests only)
 * @param {object} [options.config] - injectable config (tests only)
 * @returns {Promise<{success: true, conversationId: string, answer: string, citations: object[], tokenUsage: object|null} |
 *                    {success: false, statusCode: number|null, errorCode: string|null, reason: string}>}
 */
export const submitChatMessage = async (repositoryId, payload, options = {}) => {
    const config = options.config || getFastapiConfig();
    const httpClient = options.httpClient || axios;

    if (!config.baseUrl) {
        return {
            success: false,
            statusCode: null,
            errorCode: "MISSING_CONFIG",
            reason: "FASTAPI_BASE_URL is not configured.",
        };
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/chat`;
    const headers = { "Content-Type": "application/json" };
    // Mirrors FastAPI's own verify_service_token dev-mode passthrough: if no
    // key is configured on this side either, send the request without an
    // Authorization header rather than fabricating one.
    if (config.internalApiKey) {
        headers.Authorization = `Bearer ${config.internalApiKey}`;
    }

    try {
        const response = await httpClient.post(url, payload, {
            headers,
            // Not config.timeoutMs -- that budget is tuned for ingestion's
            // fire-and-forget submission, not a synchronous LLM call.
            timeout: config.chatTimeoutMs,
        });

        if (!response.data || typeof response.data.answer !== "string") {
            return {
                success: false,
                statusCode: response.status,
                errorCode: "MALFORMED_RESPONSE",
                reason: "FastAPI response did not contain the expected answer field.",
            };
        }

        return {
            success: true,
            conversationId: response.data.conversation_id,
            answer: response.data.answer,
            citations: Array.isArray(response.data.citations) ? response.data.citations : [],
            tokenUsage: response.data.token_usage ?? null,
        };
    } catch (error) {
        const { statusCode, reason, errorCode } = classifyFailure(error);
        return { success: false, statusCode, errorCode, reason };
    }
};

/**
 * Submits real, pre-collected commit/file evidence to the deterministic
 * repository analysis pipeline (Task 69:
 * POST /api/v1/repositories/{repository_id}/analyze -- commit analysis ->
 * churn/hotspot scoring -> structural trend detection -> insight
 * generation, none of it LLM-based).
 *
 * Never retried, same reasoning as submitChatMessage -- not because this
 * call is expensive (it is a fast, deterministic computation, unlike an
 * LLM generation), but because a caller-visible failure should surface as-is
 * rather than risk silently duplicating a call whose evidence payload the
 * caller itself just spent real GitHub API calls assembling.
 *
 * @param {string} repositoryId
 * @param {{analyzed_commit_sha: string, commits: object[], files: object[]}} payload
 * @param {object} [options]
 * @param {object} [options.httpClient] - injectable axios-compatible client (tests only)
 * @param {object} [options.config] - injectable config (tests only)
 * @returns {Promise<{success: true, repositoryId: string, generatedAt: string, analyzedCommitCount: number, analyzedFileCount: number, hotspots: object[], trends: object, insights: object[]} |
 *                    {success: false, statusCode: number|null, errorCode: string|null, reason: string}>}
 */
export const submitRepositoryAnalysis = async (repositoryId, payload, options = {}) => {
    const config = options.config || getFastapiConfig();
    const httpClient = options.httpClient || axios;

    if (!config.baseUrl) {
        return {
            success: false,
            statusCode: null,
            errorCode: "MISSING_CONFIG",
            reason: "FASTAPI_BASE_URL is not configured.",
        };
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/analyze`;
    const headers = { "Content-Type": "application/json" };
    if (config.internalApiKey) {
        headers.Authorization = `Bearer ${config.internalApiKey}`;
    }

    try {
        const response = await httpClient.post(url, payload, {
            headers,
            timeout: config.timeoutMs,
        });

        if (!response.data || !Array.isArray(response.data.insights)) {
            return {
                success: false,
                statusCode: response.status,
                errorCode: "MALFORMED_RESPONSE",
                reason: "FastAPI response did not contain the expected insights field.",
            };
        }

        return {
            success: true,
            repositoryId: response.data.repository_id || repositoryId,
            generatedAt: response.data.generated_at,
            analyzedCommitCount: response.data.analyzed_commit_count ?? 0,
            analyzedFileCount: response.data.analyzed_file_count ?? 0,
            hotspots: response.data.hotspots,
            trends: response.data.trends,
            insights: response.data.insights,
        };
    } catch (error) {
        const { statusCode, reason, errorCode } = classifyFailure(error);
        return { success: false, statusCode, errorCode, reason };
    }
};
