/**
 * Sliding-window Memory Rate Limiter Middleware for Express (Task #6).
 * Zero external library dependencies, fully compatible with Express 5.
 */

export function createRateLimiter({
    windowMs = 60 * 1000,
    max = 20,
    message = "Too many requests. Please try again later.",
    keyGenerator = (req) => (req.user?._id ? `user:${req.user._id}` : `ip:${req.ip || req.socket?.remoteAddress || "127.0.0.1"}`),
} = {}) {
    const hitsMap = new Map();

    return (req, res, next) => {
        const key = keyGenerator(req);
        const now = Date.now();
        const timestamps = hitsMap.get(key) || [];

        // Filter timestamps within current sliding window
        const windowStart = now - windowMs;
        const validTimestamps = timestamps.filter((ts) => ts > windowStart);

        if (validTimestamps.length >= max) {
            const oldestValid = validTimestamps[0];
            const retryAfterMs = oldestValid + windowMs - now;
            const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

            res.setHeader("Retry-After", retryAfterSeconds);
            res.setHeader("X-RateLimit-Limit", max);
            res.setHeader("X-RateLimit-Remaining", 0);

            return res.status(429).json({
                success: false,
                errorCode: "RATE_LIMIT_EXCEEDED",
                message,
                retryAfterSeconds,
            });
        }

        validTimestamps.push(now);
        hitsMap.set(key, validTimestamps);

        res.setHeader("X-RateLimit-Limit", max);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, max - validTimestamps.length));

        next();
    };
}

// Preset Rate Limiters for SEIS-AI Gateway
export const apiRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: "General API rate limit exceeded (200 requests / 15 min).",
});

export const aiHeavyRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: "AI resource rate limit exceeded (20 requests / min).",
});

export const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    message: "Authentication rate limit exceeded (15 requests / 15 min).",
});
