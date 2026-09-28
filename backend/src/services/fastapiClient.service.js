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
 * Builds HTTP headers including internal API authorization and X-Correlation-Id (Task #7).
 */
const buildHeaders = (config, options = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (config.internalApiKey) {
        headers.Authorization = `Bearer ${config.internalApiKey}`;
    }
    const correlationId = options.correlationId || options.req?.correlationId;
    if (correlationId) {
        headers["X-Correlation-Id"] = correlationId;
    }
    return headers;
};

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
        const status = error.response.status;
        const apiError = error.response.data?.error;
        let errorCode = apiError?.code || null;
        let reason = apiError?.message || error.response.data?.message || error.message;

        if (status === 429) {
            errorCode = errorCode || "RATE_LIMIT_EXCEEDED";
            reason = reason || "AI model quota or rate limit exceeded. Please check your API credits or try again in a few moments.";
        }

        return {
            statusCode: status,
            reason,
            errorCode,
        };
    }
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return { statusCode: 504, reason: "AI Service request timed out.", errorCode: "TIMEOUT" };
    }
    if (error.code === "ECONNREFUSED" || error.message?.includes("ECONNREFUSED")) {
        return { statusCode: 503, reason: "AI Service is offline or unreachable (connection refused).", errorCode: "SERVICE_UNAVAILABLE" };
    }
    if (error.code === "ECONNRESET" || error.message?.includes("socket hang up")) {
        return { statusCode: 503, reason: "AI Service connection was interrupted (socket hang up).", errorCode: "SERVICE_DISCONNECTED" };
    }
    return { statusCode: null, reason: `Network error: ${error.message}`, errorCode: "NETWORK_ERROR" };
};

const handleHttpError = (error, contextName) => {
    const { statusCode, reason, errorCode } = classifyFailure(error);
    return { success: false, statusCode, errorCode, reason };
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
    const headers = buildHeaders(config, options);

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

            await sleep(config.retryBaseDelayMs * 2 ** (attempt - 1));
        }
    }

    const { statusCode, reason, errorCode } = classifyFailure(lastError);
    return { success: false, statusCode, errorCode, reason, retryable: false, attempts: 0 };
};

/**
 * Sends one chat message to the real Repository Chat pipeline.
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
    const headers = buildHeaders(config, options);

    try {
        const response = await httpClient.post(url, payload, {
            headers,
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
 * Streams chat response tokens from FastAPI to Express HTTP response stream.
 */
export const streamChatMessage = async (repositoryId, payload, res, options = {}) => {
    const config = options.config || getFastapiConfig();
    const httpClient = options.httpClient || axios;

    if (!config.baseUrl) {
        res.status(500).json({
            success: false,
            message: "FASTAPI_BASE_URL is not configured.",
        });
        return;
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/chat/stream`;
    const headers = buildHeaders(config, options);

    try {
        const response = await httpClient.post(url, payload, {
            headers,
            responseType: "stream",
            timeout: config.chatTimeoutMs,
        });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        response.data.pipe(res);
    } catch (error) {
        if (!res.headersSent) {
            const { statusCode, reason } = classifyFailure(error);
            res.status(statusCode || 500).json({
                success: false,
                message: reason || "Failed to stream chat from AI service.",
            });
        }
    }
};

/**
 * Submits real, pre-collected commit/file evidence to the repository analysis pipeline.
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
    const headers = buildHeaders(config, options);

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

/**
 * Submits a commit impact & risk analysis request to FastAPI (Task #4).
 */
export const submitCommitImpactAnalysis = async (repositoryId, payload, options = {}) => {
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

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/commit-impact`;
    const headers = buildHeaders(config, options);

    try {
        const response = await httpClient.post(url, payload, {
            headers,
            timeout: config.timeoutMs,
        });

        const data = response.data || {};
        return {
            success: true,
            repositoryId: data.repository_id,
            commitSha: data.commit_sha,
            riskScore: data.risk_score,
            riskLevel: data.risk_level,
            filesChangedCount: data.files_changed_count,
            breakingChanges: data.breaking_changes || [],
            affectedModules: data.affected_modules || [],
            recommendations: data.recommendations || [],
            analyzedAt: data.analyzed_at,
        };
    } catch (err) {
        return handleHttpError(err, "submitCommitImpactAnalysis");
    }
};

/**
 * Sends an explanation request to the real RepositoryExplainService pipeline (Task 93).
 */
export const submitExplanation = async (repositoryId, payload, options = {}) => {
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

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/explain`;
    const headers = buildHeaders(config, options);

    try {
        const response = await httpClient.post(url, payload, {
            headers,
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
            taskType: response.data.task_type,
            filePath: response.data.file_path ?? null,
            answer: response.data.answer,
            citations: Array.isArray(response.data.citations) ? response.data.citations : [],
        };
    } catch (error) {
        const { statusCode, reason, errorCode } = classifyFailure(error);
        return { success: false, statusCode, errorCode, reason };
    }
};

/**
 * Submits repository evidence to the Software Evolution analysis pipeline (Task #9).
 */
export const submitEvolutionAnalysis = async (repositoryId, payload, options = {}) => {
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

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v1/repositories/${encodeURIComponent(repositoryId)}/evolution`;
    const headers = buildHeaders(config, options);

    try {
        const response = await httpClient.post(url, payload, {
            headers,
            timeout: config.timeoutMs,
        });

        const data = response.data || {};
        return {
            success: true,
            repositoryId: data.repository_id || repositoryId,
            generatedAt: data.generated_at,
            totalCommits: data.total_commits ?? 0,
            hotspots: data.hotspots || [],
            trends: data.trends || {},
            insights: data.insights || [],
            ageDistribution: data.age_distribution || {},
        };
    } catch (error) {
        const { statusCode, reason, errorCode } = classifyFailure(error);
        return { success: false, statusCode, errorCode, reason };
    }
};

