import "dotenv/config";
import mongoose from "mongoose";
import Repository from "../src/models/repositories.model.js";
import { handleFastApiIngestionStatus } from "../src/controllers/webhook.controller.js";

let testsPassed = 0;
let testsFailed = 0;

const assert = (condition, testName) => {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        testsPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        testsFailed++;
    }
};

function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            res.statusCode = code;
            return res;
        },
        json(data) {
            res.body = data;
            return res;
        },
    };
    return res;
}

const TEST_REPOSITORY_ID = new mongoose.Types.ObjectId().toString();
const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_INTERNAL_API_KEY = "test-webhook-internal-key";
const authHeaders = { authorization: `Bearer ${TEST_INTERNAL_API_KEY}` };

const runAllTests = async () => {
    const originalInternalApiKey = process.env.FASTAPI_INTERNAL_API_KEY;
    process.env.FASTAPI_INTERNAL_API_KEY = TEST_INTERNAL_API_KEY;
    console.log("\n========================================================");
    console.log("   SEIS-AI FASTAPI WEBHOOK & ATTEMPT FENCING SUITE (T5)");
    console.log("========================================================\n");

    let fakeRepo = {
        _id: TEST_REPOSITORY_ID,
        userId: TEST_USER_ID,
        name: "test-repo",
        owner: "test-owner",
        activeJobId: null,
        ingestionStatus: "pending",
        ingestionStage: null,
        chunkCount: 0,
        lastIngestedAt: null,
        lastHeartbeatAt: null,
        ingestionError: null,
    };

    const originalFindById = Repository.findById;
    const originalFindOneAndUpdate = Repository.findOneAndUpdate;

    Repository.findById = async (id) => {
        if (String(id) === TEST_REPOSITORY_ID) return { ...fakeRepo };
        return null;
    };

    Repository.findOneAndUpdate = async (query, update, options) => {
        if (String(query._id) !== TEST_REPOSITORY_ID) return null;

        // Verify status constraints
        if (query.ingestionStatus) {
            if (query.ingestionStatus.$nin && query.ingestionStatus.$nin.includes(fakeRepo.ingestionStatus)) {
                return null;
            }
        }

        // Apply $set updates
        if (update.$set) {
            Object.assign(fakeRepo, update.$set);
        }
        return { ...fakeRepo };
    };

    try {
        const unauthorized = mockRes();
        await handleFastApiIngestionStatus({ body: {}, headers: {} }, unauthorized, () => {});
        assert(unauthorized.statusCode === 401, "Webhook rejects a missing service key");

        console.log("1. Testing webhook rejects request missing repository_id...");
        {
            const req = { body: { status: "READY" }, headers: authHeaders };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 400, "Rejects request missing repository_id with 400");
            assert(res.body?.success === false, "Returns success: false");
        }

        console.log("\n2. Testing webhook rejects unknown status strings...");
        {
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "INVALID_UNKNOWN_STATUS",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 400, "Rejects unknown status with 400");
            assert(res.body?.message?.includes("Invalid status value"), "Returns descriptive status error");
        }

        console.log("\n3. Testing webhook rejects malformed timestamp...");
        {
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "PROCESSING",
                    timestamp: "not-a-valid-date-time",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 400, "Rejects invalid timestamp format with 400");
        }

        console.log("\n4. Testing valid PROCESSING callback updates status and establishes activeJobId...");
        {
            fakeRepo.ingestionStatus = "pending";
            fakeRepo.activeJobId = null;

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-1",
                    status: "PROCESSING",
                    stage: "CHUNKING",
                    timestamp: new Date().toISOString(),
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on valid status update");
            assert(res.body?.success === true, "Returns success: true");
            assert(fakeRepo.ingestionStatus === "processing", "Updates ingestionStatus to 'processing'");
            assert(fakeRepo.ingestionStage === "CHUNKING", "Updates ingestionStage to 'CHUNKING'");
            assert(fakeRepo.activeJobId === "job-attempt-1", "Binds activeJobId to 'job-attempt-1'");
        }

        console.log("\n5. Testing attempt fencing: older/mismatched job callback is rejected when newer job is active...");
        {
            fakeRepo.activeJobId = "job-attempt-2"; // A newer attempt owns the record
            fakeRepo.ingestionStatus = "processing";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-1", // Stale attempt callback
                    status: "PROCESSING",
                    stage: "EMBEDDING",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 with ignored flag");
            assert(res.body?.ignored === true, "Marks response ignored: true");
            assert(res.body?.reason === "stale_attempt_superseded", "Identifies reason: stale_attempt_superseded");
            assert(fakeRepo.activeJobId === "job-attempt-2", "Preserves newer activeJobId 'job-attempt-2'");
        }

        console.log("\n6. Testing attempt fencing: callback without job_id rejected when modern attempt owns record...");
        {
            fakeRepo.activeJobId = "job-attempt-2";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "PROCESSING", // Missing job_id
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.body?.ignored === true, "Ignores callback missing job_id when activeJobId set");
            assert(res.body?.reason === "missing_attempt_id", "Identifies reason: missing_attempt_id");
        }

        console.log("\n7. Testing webhook updates status to COMPLETED (READY)...");
        {
            fakeRepo.activeJobId = "job-attempt-2";
            fakeRepo.ingestionStatus = "processing";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-2",
                    status: "READY",
                    stage: null,
                    chunk_count: 55,
                    timestamp: new Date().toISOString(),
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on completion update");
            assert(fakeRepo.ingestionStatus === "completed", "Updates ingestionStatus to 'completed'");
            assert(fakeRepo.chunkCount === 55, "Updates chunkCount to 55");
            assert(fakeRepo.lastIngestedAt !== null, "Sets lastIngestedAt timestamp");
            assert(fakeRepo.ingestionError === null, "Clears ingestionError on completion");
        }

        console.log("\n8. Testing delayed progress callback cannot resurrect COMPLETED status back to processing...");
        {
            // Repository is already completed for job-attempt-2
            fakeRepo.activeJobId = "job-attempt-2";
            fakeRepo.ingestionStatus = "completed";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-2",
                    status: "PROCESSING", // Delayed progress callback
                    stage: "INDEXING",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 with ignored flag");
            assert(res.body?.ignored === true, "Marks delayed progress callback as ignored");
            assert(res.body?.reason === "terminal_state_preserved", "Reason is terminal_state_preserved");
            assert(fakeRepo.ingestionStatus === "completed", "Preserves completed status without resurrecting to processing");
        }

        console.log("\n9. Testing webhook updates status to FAILED for matching job...");
        {
            fakeRepo.activeJobId = "job-attempt-3";
            fakeRepo.ingestionStatus = "processing";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-3",
                    status: "FAILED",
                    error: "Parsing syntax error in main.py",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on failure status update");
            assert(fakeRepo.ingestionStatus === "failed", "Updates ingestionStatus to 'failed'");
            assert(fakeRepo.ingestionError === "Parsing syntax error in main.py", "Records error string");
        }

        console.log("\n10. Testing webhook returns 404 for unknown repository_id...");
        {
            const req = {
                body: {
                    repository_id: new mongoose.Types.ObjectId().toString(),
                    status: "READY",
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 404, "Returns 404 when repository is not found");
        }

        console.log("\n11. Testing QUEUED heartbeat callback updates status and lastHeartbeatAt when pending...");
        {
            fakeRepo.activeJobId = "job-attempt-4";
            fakeRepo.ingestionStatus = "pending";
            fakeRepo.lastHeartbeatAt = null;

            const heartbeatTime = new Date().toISOString();
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-4",
                    status: "QUEUED",
                    timestamp: heartbeatTime,
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on QUEUED status update");
            assert(fakeRepo.ingestionStatus === "queued", "Updates ingestionStatus to 'queued'");
            assert(fakeRepo.lastHeartbeatAt !== null, "Updates lastHeartbeatAt on queued heartbeat");
        }

        console.log("\n12. Testing QUEUED heartbeat does NOT downgrade processing repository...");
        {
            fakeRepo.activeJobId = "job-attempt-4";
            fakeRepo.ingestionStatus = "processing";
            fakeRepo.ingestionStage = "CHUNKING";
            const initialHeartbeat = new Date(Date.now() - 30000);
            fakeRepo.lastHeartbeatAt = initialHeartbeat;

            const newHeartbeatTime = new Date().toISOString();
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-4",
                    status: "QUEUED",
                    timestamp: newHeartbeatTime,
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on heartbeat update");
            assert(fakeRepo.ingestionStatus === "processing", "Preserves 'processing' status without downgrading to queued");
            assert(fakeRepo.ingestionStage === "CHUNKING", "Preserves existing 'CHUNKING' stage");
            assert(new Date(fakeRepo.lastHeartbeatAt).getTime() >= initialHeartbeat.getTime(), "Advances lastHeartbeatAt");
        }

        console.log("\n13. Testing QUEUED heartbeat is ignored when repository is terminal...");
        {
            fakeRepo.activeJobId = "job-attempt-4";
            fakeRepo.ingestionStatus = "completed";

            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    job_id: "job-attempt-4",
                    status: "QUEUED",
                    timestamp: new Date().toISOString(),
                },
                headers: authHeaders,
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 with ignored flag");
            assert(res.body?.ignored === true, "Marks callback as ignored");
            assert(res.body?.reason === "terminal_state_preserved", "Reason is terminal_state_preserved");
            assert(fakeRepo.ingestionStatus === "completed", "Preserves completed status");
        }

    } finally {
        if (originalInternalApiKey === undefined) delete process.env.FASTAPI_INTERNAL_API_KEY;
        else process.env.FASTAPI_INTERNAL_API_KEY = originalInternalApiKey;
        Repository.findById = originalFindById;
        Repository.findOneAndUpdate = originalFindOneAndUpdate;
    }

    console.log("\n========================================================");
    console.log(`  TEST RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log("========================================================\n");

    if (testsFailed > 0) {
        process.exit(1);
    }
};

runAllTests().catch((err) => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
