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

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI FASTAPI WEBHOOK SUITE (Task #2) ");
    console.log("=========================================\n");

    const fakeRepo = {
        _id: TEST_REPOSITORY_ID,
        userId: TEST_USER_ID,
        name: "test-repo",
        owner: "test-owner",
        ingestionStatus: "pending",
        ingestionStage: null,
        chunkCount: 0,
        lastIngestedAt: null,
        ingestionError: null,
        save: async function () {
            return this;
        },
    };

    const originalFindById = Repository.findById;

    Repository.findById = async (id) => {
        if (String(id) === TEST_REPOSITORY_ID) return fakeRepo;
        return null;
    };

    try {
        console.log("1. Testing webhook rejects request missing repository_id...");
        {
            const req = { body: { status: "READY" }, headers: {} };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 400, "Rejects request missing repository_id with 400");
            assert(res.body?.success === false, "Returns success: false");
        }

        console.log("\n2. Testing webhook updates status to PROCESSING...");
        {
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "PROCESSING",
                    stage: "CHUNKING",
                },
                headers: {},
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on valid status update");
            assert(res.body?.success === true, "Returns success: true");
            assert(fakeRepo.ingestionStatus === "processing", "Updates ingestionStatus to 'processing'");
            assert(fakeRepo.ingestionStage === "CHUNKING", "Updates ingestionStage to 'CHUNKING'");
        }

        console.log("\n3. Testing webhook updates status to COMPLETED (READY)...");
        {
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "READY",
                    stage: null,
                    chunk_count: 55,
                    timestamp: new Date().toISOString(),
                },
                headers: {},
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on completion update");
            assert(fakeRepo.ingestionStatus === "completed", "Updates ingestionStatus to 'completed'");
            assert(fakeRepo.chunkCount === 55, "Updates chunkCount to 55");
            assert(fakeRepo.lastIngestedAt !== null, "Sets lastIngestedAt timestamp");
            assert(fakeRepo.ingestionError === null, "Clears ingestionError on completion");
        }

        console.log("\n4. Testing webhook updates status to FAILED...");
        {
            const req = {
                body: {
                    repository_id: TEST_REPOSITORY_ID,
                    status: "FAILED",
                    error: "Parsing syntax error in main.py",
                },
                headers: {},
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 200, "Returns 200 on failure status update");
            assert(fakeRepo.ingestionStatus === "failed", "Updates ingestionStatus to 'failed'");
            assert(fakeRepo.ingestionError === "Parsing syntax error in main.py", "Records error string");
        }

        console.log("\n5. Testing webhook returns 404 for unknown repository_id...");
        {
            const req = {
                body: {
                    repository_id: new mongoose.Types.ObjectId().toString(),
                    status: "READY",
                },
                headers: {},
            };
            const res = mockRes();
            await handleFastApiIngestionStatus(req, res, () => {});

            assert(res.statusCode === 404, "Returns 404 when repository is not found");
        }

    } finally {
        Repository.findById = originalFindById;
    }

    console.log("\n=========================================");
    console.log(`  TEST RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log("=========================================\n");

    if (testsFailed > 0) {
        process.exit(1);
    }
};

runAllTests().catch((err) => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
