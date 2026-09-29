/**
 * CORS Configuration and Origin Allowlist Management (Task T3).
 *
 * Implements strict, safe multi-origin CORS validation:
 * - FRONTEND_URL: Canonical frontend origin (e.g. used for OAuth redirects).
 * - CORS_ALLOWED_ORIGINS: Comma-separated list of approved browser origins
 *   (e.g. preview deployments, staging domains).
 * - Enforces HTTPS in production; allows explicitly configured HTTP in development.
 * - Rejects non-root paths, query parameters, fragments, credentials, and literal 'null'.
 * - Preserves credentials: true and exact-origin reflection (never wildcard '*').
 * - Requests without an Origin header (e.g. server-to-server, health checks)
 *   are allowed through to their existing auth/authorization checks.
 */

/**
 * Parses, validates, and normalizes a single raw origin entry.
 *
 * @param {string} rawEntry - The raw origin string from environment variables.
 * @param {boolean} isProduction - Whether running in production mode.
 * @returns {string} The normalized origin string (e.g. "https://seis-ai.vercel.app").
 * @throws {Error} If the entry is malformed or violates origin safety rules.
 */
export function normalizeAndValidateOrigin(rawEntry, isProduction) {
    if (!rawEntry || typeof rawEntry !== "string") {
        throw new Error("Origin entry must be a non-empty string.");
    }

    const entry = rawEntry.trim();
    if (!entry) {
        throw new Error("Origin entry cannot be empty or blank.");
    }

    let parsed;
    try {
        parsed = new URL(entry);
    } catch {
        throw new Error(`Invalid CORS origin URL: "${entry}".`);
    }

    // Reject embedded user/password credentials
    if (parsed.username || parsed.password) {
        throw new Error(`Invalid CORS origin "${entry}": User credentials are not permitted.`);
    }

    // Reject query parameters
    if (parsed.search) {
        throw new Error(`Invalid CORS origin "${entry}": Query parameters are not permitted.`);
    }

    // Reject URL fragments / hashes
    if (parsed.hash) {
        throw new Error(`Invalid CORS origin "${entry}": URL fragments/hashes are not permitted.`);
    }

    // Allow root trailing slash by normalizing, but reject non-root paths
    if (parsed.pathname && parsed.pathname !== "/") {
        throw new Error(`Invalid CORS origin "${entry}": Non-root paths are not permitted.`);
    }

    // Protocol enforcement
    if (isProduction) {
        if (parsed.protocol !== "https:") {
            throw new Error(`Invalid CORS origin "${entry}": Production origins must use HTTPS protocol.`);
        }
    } else {
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(`Invalid CORS origin "${entry}": Origin protocol must be HTTP or HTTPS.`);
        }
    }

    const origin = parsed.origin;
    if (!origin || origin === "null") {
        throw new Error(`Invalid CORS origin "${entry}": Origin cannot be null.`);
    }

    return origin;
}

/**
 * Computes the deduplicated Set of allowed origins from environment configuration.
 *
 * @param {object} [env=process.env] - Environment variables object.
 * @returns {Set<string>} Deduplicated Set of normalized origin strings.
 * @throws {Error} In production if no valid origins are configured, or if any entry is invalid.
 */
export function getAllowedOrigins(env = process.env) {
    const isProduction = env.NODE_ENV === "production";
    const allowed = new Set();

    // 1. Process canonical FRONTEND_URL
    if (env.FRONTEND_URL && env.FRONTEND_URL.trim()) {
        const canonical = normalizeAndValidateOrigin(env.FRONTEND_URL, isProduction);
        allowed.add(canonical);
    }

    // 2. Process CORS_ALLOWED_ORIGINS (comma-separated list)
    if (env.CORS_ALLOWED_ORIGINS && env.CORS_ALLOWED_ORIGINS.trim()) {
        const rawOrigins = env.CORS_ALLOWED_ORIGINS.split(",");
        for (const raw of rawOrigins) {
            const trimmed = raw.trim();
            if (trimmed) {
                const normalized = normalizeAndValidateOrigin(trimmed, isProduction);
                allowed.add(normalized);
            }
        }
    }

    // Production safety gate: must have at least one valid origin configured
    if (isProduction && allowed.size === 0) {
        throw new Error(
            "CORS configuration error: Production requires at least one valid HTTPS origin configured in FRONTEND_URL or CORS_ALLOWED_ORIGINS."
        );
    }

    return allowed;
}

/**
 * Validates the CORS environment configuration immediately.
 * Called at application startup in server.js to fail fast on invalid production configs.
 *
 * @param {object} [env=process.env] - Environment variables object.
 * @returns {Set<string>} The validated origins set.
 */
export function validateCorsConfig(env = process.env) {
    return getAllowedOrigins(env);
}

/**
 * Creates the options configuration object for Express cors() middleware.
 *
 * @param {Function|object} [envProvider=() => process.env] - Function returning env or env object.
 * @returns {object} Options object compatible with cors() middleware.
 */
export function createCorsOptions(envProvider = () => process.env) {
    return {
        origin: (origin, callback) => {
            // 1. Allow requests without an Origin header (curl, health probes, server-to-server callbacks)
            if (!origin) {
                return callback(null, true);
            }

            // 2. Explicitly reject literal "null" origin (e.g. sandboxed iframes, file://)
            if (origin === "null") {
                const err = new Error("CORS rejected: Origin 'null' is not permitted.");
                err.statusCode = 403;
                return callback(err);
            }

            try {
                const env = typeof envProvider === "function" ? envProvider() : envProvider;
                const allowedOrigins = getAllowedOrigins(env);

                if (allowedOrigins.has(origin)) {
                    // Exact match: return true so cors sets Access-Control-Allow-Origin: <origin>
                    return callback(null, true);
                }

                // Origin is not in the approved allowlist
                const err = new Error(`CORS rejected: Origin '${origin}' is not in the allowed origins list.`);
                err.statusCode = 403;
                return callback(err);
            } catch (configError) {
                // Surface configuration validation errors via centralized error handler
                configError.statusCode = 500;
                return callback(configError);
            }
        },
        credentials: true,
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
    };
}
