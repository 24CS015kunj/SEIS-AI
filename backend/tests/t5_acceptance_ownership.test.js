import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";
import { makeIngestRepository } from "../src/controllers/github.controller.js";
import { handleFastApiIngestionStatus } from "../src/controllers/webhook.controller.js";

const MONGO_URI = process.env.TEST_MONGODB_URI;

function createMockRes() {
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

describe("TASK T5 ACCEPTANCE: Re-ingestion Ownership & Webhook Protocol Suite", {
    skip: !MONGO_URI && "Set TEST_MONGODB_URI to a dedicated test database",
}, () => {
    let testUserId;
    let testWorkspaceId;
    const createdRepositoryIds = [];
    const originalInternalKey = process.env.FASTAPI_INTERNAL_API_KEY;
    let ownsConnection = false;

    before(async () => {
        let parsed;
        try {
            parsed = new URL(MONGO_URI);
        } catch {
            throw new Error("TEST_MONGODB_URI must be a valid dedicated test database URI");
        }
        const database = decodeURIComponent(parsed.pathname.slice(1));
        assert.ok(["mongodb:", "mongodb+srv:"].includes(parsed.protocol)
            && /(?:^|[_-])test(?:$|[_-])/i.test(database)
            && !database.includes("/"), "TEST_MONGODB_URI must name a dedicated test database");
        assert.equal(mongoose.connection.readyState, 0, "Test requires its own connection");
        ownsConnection = true;
        process.env.FASTAPI_INTERNAL_API_KEY = "";
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        }
        testUserId = new mongoose.Types.ObjectId();
        testWorkspaceId = new mongoose.Types.ObjectId();
    });

    after(async () => {
        try {
            if (ownsConnection && mongoose.connection.readyState === 1) {
                await Branch.deleteMany({ repositoryId: { $in: createdRepositoryIds } });
                await Repository.deleteMany({ _id: { $in: createdRepositoryIds }, userId: testUserId });
            }
        } finally {
            if (ownsConnection) await mongoose.disconnect();
            if (originalInternalKey === undefined) delete process.env.FASTAPI_INTERNAL_API_KEY;
            else process.env.FASTAPI_INTERNAL_API_KEY = originalInternalKey;
        }
    });

    async function createTestRepo(customFields = {}) {
        const uniqueId = new mongoose.Types.ObjectId().toString();
        const repo = await Repository.create({
            userId: testUserId,
            githubRepoId: `gh-${uniqueId}`,
            owner: "test-org",
            name: `test-repo-${uniqueId}`,
            fullName: `test-org/test-repo-${uniqueId}`,
            htmlUrl: `https://github.com/test-org/test-repo-${uniqueId}`,
            defaultBranch: "main",
            workspaceId: testWorkspaceId,
            ...customFields,
        });
        createdRepositoryIds.push(repo._id);
        return repo;
    }

    it("1. A completed -> B for a new commit -> B completes in both stores", async () => {
        const repo = await createTestRepo({
            activeJobId: "attempt-A",
            ingestionStatus: "completed",
            ingestionStage: "completed",
            lastIngestedCommitSha: "sha-commit-A",
            chunkCount: 10,
        });

        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-B",
        });

        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            filesEligible: 5,
            submittedJob: {
                jobId: "attempt-B",
                fileCount: 5,
                status: "pending",
            },
        });

        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        let nextErr = null;

        await ingestController(req, res, (err) => { nextErr = err; });

        assert.equal(nextErr, null, "Controller executed without throwing");
        assert.equal(res.statusCode, 202, "Returns HTTP 202 Accepted for new attempt");
        assert.equal(res.body?.activeJobId, "attempt-B");
        assert.equal(res.body?.ingestionStatus, "processing");

        // Verify in real Mongo
        const repoInMongo = await Repository.findById(repo._id);
        assert.equal(repoInMongo.activeJobId, "attempt-B", "Mongo updated activeJobId to attempt-B");
        assert.equal(repoInMongo.ingestionStatus, "processing", "Mongo updated status to processing");
        assert.equal(repoInMongo.lastIngestedCommitSha, "sha-commit-B", "Mongo updated commit SHA to sha-B");

        // Now attempt-B sends terminal callback
        const webhookReq = {
            body: {
                repository_id: repo._id.toString(),
                job_id: "attempt-B",
                status: "READY",
                chunk_count: 45,
                timestamp: new Date().toISOString(),
            },
            headers: {},
        };
        const webhookRes = createMockRes();
        await handleFastApiIngestionStatus(webhookReq, webhookRes, () => {});

        assert.equal(webhookRes.statusCode, 200, "Webhook returns 200 on READY callback");
        assert.equal(webhookRes.body?.applied, true, "Webhook reports update applied");

        const finalizedRepo = await Repository.findById(repo._id);
        assert.equal(finalizedRepo.activeJobId, "attempt-B");
        assert.equal(finalizedRepo.ingestionStatus, "completed");
        assert.equal(finalizedRepo.chunkCount, 45);
    });

    it("2. A failed -> retry B -> B completes", async () => {
        const repo = await createTestRepo({
            activeJobId: "attempt-A-failed",
            ingestionStatus: "failed",
            ingestionStage: "chunking",
            lastIngestedCommitSha: "sha-commit-1",
            ingestionError: "AST parsing timeout on main.py",
        });

        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-1",
        });

        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            filesEligible: 3,
            submittedJob: {
                jobId: "attempt-B-retry",
                fileCount: 3,
                status: "pending",
            },
        });

        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        let nextErr = null;

        await ingestController(req, res, (err) => { nextErr = err; });

        assert.equal(nextErr, null);
        assert.equal(res.statusCode, 202);
        assert.equal(res.body?.activeJobId, "attempt-B-retry");

        // Verify in real Mongo
        const repoInMongo = await Repository.findById(repo._id);
        assert.equal(repoInMongo.activeJobId, "attempt-B-retry");
        assert.equal(repoInMongo.ingestionStatus, "processing");
        assert.equal(repoInMongo.ingestionError, null, "Prior error cleared on retry");

        // Webhook callback for attempt-B-retry
        const webhookReq = {
            body: {
                repository_id: repo._id.toString(),
                job_id: "attempt-B-retry",
                status: "READY",
                chunk_count: 12,
            },
            headers: {},
        };
        const webhookRes = createMockRes();
        await handleFastApiIngestionStatus(webhookReq, webhookRes, () => {});

        assert.equal(webhookRes.statusCode, 200);
        const finalizedRepo = await Repository.findById(repo._id);
        assert.equal(finalizedRepo.ingestionStatus, "completed");
        assert.equal(finalizedRepo.chunkCount, 12);
        assert.equal(finalizedRepo.ingestionError, null);
    });

    it("3. B completes before its HTTP submission response is processed", async () => {
        const repo = await createTestRepo({
            activeJobId: null,
            ingestionStatus: "pending",
        });

        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-fast",
        });

        // Fast callback arrives before submission response handler runs findOneAndUpdate
        const webhookReq = {
            body: {
                repository_id: repo._id.toString(),
                job_id: "attempt-B-fast",
                status: "READY",
                chunk_count: 99,
                timestamp: new Date().toISOString(),
            },
            headers: {},
        };
        const webhookRes = createMockRes();
        await handleFastApiIngestionStatus(webhookReq, webhookRes, () => {});

        assert.equal(webhookRes.statusCode, 200);
        assert.equal(webhookRes.body?.applied, true);

        // Verify Mongo already has activeJobId and completed status
        const completedEarly = await Repository.findById(repo._id);
        assert.equal(completedEarly.activeJobId, "attempt-B-fast");
        assert.equal(completedEarly.ingestionStatus, "completed");

        // Now the delayed submission response handler runs findOneAndUpdate
        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            filesEligible: 8,
            submittedJob: {
                jobId: "attempt-B-fast",
                fileCount: 8,
                status: "pending",
            },
        });

        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        await ingestController(req, res, () => {});

        assert.equal(res.statusCode, 202);
        assert.equal(res.body?.activeJobId, "attempt-B-fast");
        // Effective status preserves completed!
        assert.equal(res.body?.ingestionStatus, "completed", "Terminal completed status preserved against delayed submission response");

        // Ensure Mongo record is still completed, not overwritten to processing
        const finalRepo = await Repository.findById(repo._id);
        assert.equal(finalRepo.ingestionStatus, "completed");
        assert.equal(finalRepo.chunkCount, 99);
    });

    it("4. A delayed submission response arrives after B/C owns the repository", async () => {
        const repo = await createTestRepo({
            activeJobId: "attempt-old",
            ingestionStatus: "completed",
            lastIngestedCommitSha: "sha-commit-old",
        });

        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-A",
        });

        // While submission A is in flight to FastAPI, another modern attempt C claims ownership in Mongo
        const mockPrepareAndSubmit = async () => {
            // Concurrent submission C executes and claims Mongo ownership
            await Repository.findByIdAndUpdate(repo._id, {
                $set: {
                    activeJobId: "attempt-C-modern",
                    ingestionStatus: "processing",
                    lastIngestedCommitSha: "sha-commit-C",
                    lastHeartbeatAt: new Date(),
                },
            });

            // Delayed response for attempt-A returns afterwards
            return {
                blocked: false,
                filesEligible: 2,
                submittedJob: {
                    jobId: "attempt-A-delayed",
                    fileCount: 2,
                    status: "pending",
                },
            };
        };

        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        await ingestController(req, res, () => {});

        assert.equal(res.statusCode, 409, "Delayed submission rejected with 409 Conflict");
        assert.equal(res.body?.activeJobId, "attempt-C-modern", "Identifies newer activeJobId");

        // Verify Mongo still owned by C
        const currentRepo = await Repository.findById(repo._id);
        assert.equal(currentRepo.activeJobId, "attempt-C-modern", "Preserves modern attempt ownership in Mongo");
        assert.equal(currentRepo.ingestionStatus, "processing");
    });

    it("5. Callback delivery encounters a temporarily unbound attempt, then succeeds after ownership settles", async () => {
        // Mongo currently has completed attempt-A
        const repo = await createTestRepo({
            activeJobId: "attempt-A-prior",
            ingestionStatus: "completed",
            chunkCount: 20,
        });

        // 1. Callback arrives for attempt-B while Mongo is still on prior attempt-A
        const earlyWebhookReq = {
            body: {
                repository_id: repo._id.toString(),
                job_id: "attempt-B-new",
                status: "PROCESSING",
                stage: "CHUNKING",
                timestamp: new Date().toISOString(),
            },
            headers: {},
        };
        const earlyWebhookRes = createMockRes();
        await handleFastApiIngestionStatus(earlyWebhookReq, earlyWebhookRes, () => {});

        assert.equal(earlyWebhookRes.statusCode, 409, "Returns 409 retryable while ownership not yet settled");
        assert.equal(earlyWebhookRes.body?.retryable, true, "Marks retryable: true");
        assert.equal(earlyWebhookRes.body?.reason, "attempt_ownership_not_settled");

        // Mongo still has attempt-A
        const repoBeforeSettle = await Repository.findById(repo._id);
        assert.equal(repoBeforeSettle.activeJobId, "attempt-A-prior");

        // 2. makeIngestRepository executes and settles ownership to attempt-B
        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-B",
        });

        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            filesEligible: 5,
            submittedJob: {
                jobId: "attempt-B-new",
                fileCount: 5,
                status: "pending",
            },
        });
        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        await ingestController(req, res, () => {});

        assert.equal(res.statusCode, 202);
        assert.equal(res.body?.activeJobId, "attempt-B-new");

        // 3. Callback retries delivery now that ownership has settled
        const retryWebhookRes = createMockRes();
        await handleFastApiIngestionStatus(earlyWebhookReq, retryWebhookRes, () => {});

        assert.equal(retryWebhookRes.statusCode, 200, "Returns 200 once ownership settled");
        assert.equal(retryWebhookRes.body?.applied, true);

        const repoAfterSettle = await Repository.findById(repo._id);
        assert.equal(repoAfterSettle.activeJobId, "attempt-B-new");
        assert.equal(repoAfterSettle.ingestionStatus, "processing");
        assert.equal(repoAfterSettle.ingestionStage, "CHUNKING");
    });

    it("6. Mongo acceptance persistence fails; no misleading success or lost completion results", async () => {
        const repo = await createTestRepo({
            activeJobId: "attempt-A",
            ingestionStatus: "completed",
        });

        await Branch.create({
            repositoryId: repo._id,
            name: "main",
            latestCommitSha: "sha-commit-fail",
        });

        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            filesEligible: 4,
            submittedJob: {
                jobId: "attempt-B-error",
                fileCount: 4,
                status: "pending",
            },
        });

        const ingestController = makeIngestRepository({
            prepareAndSubmitIngestion: mockPrepareAndSubmit,
        });

        // Simulate Mongo persistence failure during findOneAndUpdate
        const originalFindOneAndUpdate = Repository.findOneAndUpdate;
        Repository.findOneAndUpdate = async () => {
            throw new Error("Mongo network connection lost during write");
        };

        const req = {
            params: { repositoryId: repo._id.toString() },
            body: { branch: "main" },
            user: { _id: testUserId, accessToken: "fake-token" },
        };
        const res = createMockRes();
        let errorCaught = null;

        try {
            await ingestController(req, res, (err) => {
                errorCaught = err;
            });
        } finally {
            Repository.findOneAndUpdate = originalFindOneAndUpdate;
        }

        assert.ok(errorCaught !== null, "Mongo error is passed to next() middleware");
        assert.match(errorCaught.message, /Mongo network connection lost/);
        assert.notEqual(res.statusCode, 202, "Does NOT falsely return 202 when persistence failed");
    });
});
