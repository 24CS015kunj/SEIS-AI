import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/middleware/rateLimiter.middleware.js";

describe("SEIS-AI GATEWAY RATE LIMITER SUITE (Task #6)", () => {
    it("1. Allows requests up to max limit and returns standard headers", () => {
        const limiter = createRateLimiter({
            windowMs: 60 * 1000,
            max: 3,
            keyGenerator: () => "test-user-1",
        });

        const req = { user: { _id: "user-1" } };
        const headers = {};
        const res = {
            setHeader: (name, val) => { headers[name] = val; },
        };

        let nextCalled = 0;
        const next = () => { nextCalled += 1; };

        limiter(req, res, next);
        limiter(req, res, next);
        limiter(req, res, next);

        assert.equal(nextCalled, 3);
        assert.equal(headers["X-RateLimit-Limit"], 3);
        assert.equal(headers["X-RateLimit-Remaining"], 0);
    });

    it("2. Blocks 4th request when limit of 3 is exceeded and returns HTTP 429", () => {
        const limiter = createRateLimiter({
            windowMs: 60 * 1000,
            max: 3,
            keyGenerator: () => "test-user-2",
        });

        const req = { user: { _id: "user-2" } };
        let responseStatus = null;
        let responseJson = null;
        const headers = {};

        const res = {
            setHeader: (name, val) => { headers[name] = val; },
            status: (code) => {
                responseStatus = code;
                return {
                    json: (data) => { responseJson = data; },
                };
            },
        };

        const next = () => {};

        limiter(req, res, next);
        limiter(req, res, next);
        limiter(req, res, next);

        // 4th request should trigger 429
        limiter(req, res, next);

        assert.equal(responseStatus, 429);
        assert.equal(responseJson.success, false);
        assert.equal(responseJson.errorCode, "RATE_LIMIT_EXCEEDED");
        assert.equal(headers["Retry-After"] > 0, true);
    });
});
