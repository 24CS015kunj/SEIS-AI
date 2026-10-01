/**
 * Express HTTP Request Logger Middleware (Task #7).
 * Emits structured request logs with timing, status, and correlation ID.
 */
export function requestLoggerMiddleware(req, res, next) {
    const start = performance.now();

    res.on("finish", () => {
        const durationMs = Math.round(performance.now() - start);
        const correlationId = req.correlationId || "-";
        
        // Log in production-friendly structured format
        if (process.env.NODE_ENV !== "test") {
            console.log(
                JSON.stringify({
                    event: "express.request",
                    method: req.method,
                    // Query strings can contain OAuth codes and other credentials.
                    path: req.path || (req.originalUrl || req.url || "").split("?")[0],
                    status: res.statusCode,
                    durationMs,
                    correlationId,
                    timestamp: new Date().toISOString(),
                })
            );
        }
    });

    next();
}
