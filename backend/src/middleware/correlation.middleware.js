import { randomUUID } from "node:crypto";

/**
 * Express Middleware to extract or generate an X-Correlation-Id header (Task #7).
 * Ensures every incoming HTTP request has a unique correlation ID attached
 * to `req.correlationId` and set on response header `X-Correlation-Id`.
 */
export function correlationMiddleware(req, res, next) {
    const inboundCorrelationId = req.headers["x-correlation-id"];
    const correlationId = typeof inboundCorrelationId === "string" && inboundCorrelationId.trim()
        ? inboundCorrelationId.trim()
        : randomUUID();

    req.correlationId = correlationId;
    res.setHeader("X-Correlation-Id", correlationId);
    next();
}
