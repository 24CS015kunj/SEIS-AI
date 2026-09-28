import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { correlationMiddleware } from "../src/middleware/correlation.middleware.js";
import { submitChatMessage } from "../src/services/fastapiClient.service.js";
import { cleanupStuckIngestions } from "../src/services/ingestionPreparation.service.js";
import Repository from "../src/models/repositories.model.js";

describe("SEIS-AI PRODUCTION OBSERVABILITY & RELIABILITY SUITE (Task #7)", () => {
    it("1. Correlation middleware assigns correlationId and sets X-Correlation-Id header", () => {
        const req = { headers: {} };
        const headers = {};
        const res = {
            setHeader: (name, val) => { headers[name] = val; },
        };

        let nextCalled = false;
        correlationMiddleware(req, res, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(typeof req.correlationId, "string");
        assert.equal(headers["X-Correlation-Id"], req.correlationId);
    });

    it("2. Client forwards X-Correlation-Id header when provided in options", async () => {
        let sentHeaders = null;
        const mockHttpClient = {
            post: async (url, payload, options) => {
                sentHeaders = options.headers;
                return {
                    status: 200,
                    data: {
                        conversation_id: "conv-123",
                        answer: "Test answer",
                        citations: [],
                    },
                };
            },
        };

        const result = await submitChatMessage(
            "repo-123",
            { message: "test question", conversation_id: "conv-123" },
            {
                httpClient: mockHttpClient,
                config: { baseUrl: "http://localhost:8000", internalApiKey: "secret_123" },
                correlationId: "test-correlation-abc-123",
            }
        );

        assert.equal(result.success, true);
        assert.equal(sentHeaders["X-Correlation-Id"], "test-correlation-abc-123");
        assert.equal(sentHeaders["Authorization"], "Bearer secret_123");
    });

    it("3. Ingestion watchdog marks stuck processing jobs as failed", async () => {
        const originalUpdateMany = Repository.updateMany;
        let updateQuery = null;

        Repository.updateMany = async function (filter, update) {
            updateQuery = { filter, update };
            return { modifiedCount: 2 };
        };

        try {
            const count = await cleanupStuckIngestions(15);
            assert.equal(count, 2);
            assert.equal(updateQuery.filter.ingestionStatus, "processing");
            assert.equal(updateQuery.update.$set.ingestionStatus, "failed");
        } finally {
            Repository.updateMany = originalUpdateMany;
        }
    });
});
