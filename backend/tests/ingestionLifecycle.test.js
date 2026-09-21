import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { makeIngestRepository, getRepository } from "../src/controllers/github.controller.js";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";

describe("SEIS-AI INGESTION LIFECYCLE & IDEMPOTENCY SUITE", () => {
    const FAKE_REPO_ID = new mongoose.Types.ObjectId().toString();
    const FAKE_USER_ID = new mongoose.Types.ObjectId().toString();
    const FAKE_WORKSPACE_ID = new mongoose.Types.ObjectId().toString();
    const COMMIT_SHA_1 = "sha-commit-111111111111";
    const COMMIT_SHA_2 = "sha-commit-222222222222";

    it("1. Single repository lookup returns serialized ingestion lifecycle fields", async () => {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async () => ({
            _id: FAKE_REPO_ID,
            userId: FAKE_USER_ID,
            owner: "testowner",
            name: "testrepo",
            defaultBranch: "main",
            workspaceId: FAKE_WORKSPACE_ID,
            ingestionStatus: "completed",
            ingestionStage: "completed",
            chunkCount: 42,
            lastIngestedAt: new Date("2026-09-01T10:00:00Z"),
            ingestionError: null,
            lastIngestedCommitSha: COMMIT_SHA_1,
        });

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (c) => {
                statusCode = c;
                return res;
            },
            json: (p) => {
                responseJson = p;
            },
        };

        const req = { params: { repositoryId: FAKE_REPO_ID }, user: { _id: FAKE_USER_ID } };

        try {
            await getRepository(req, res, () => {});

            assert.equal(statusCode, 200);
            assert.equal(responseJson.success, true);
            assert.equal(responseJson.repository.ingestionStatus, "completed");
            assert.equal(responseJson.repository.chunkCount, 42);
            assert.equal(responseJson.repository.lastIngestedCommitSha, COMMIT_SHA_1);
        } finally {
            Repository.findOne = originalFindOne;
        }
    });

    it("2. PROCESSING repository rejects duplicate ingestion trigger idempotently", async () => {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;

        Repository.findOne = async () => ({
            _id: FAKE_REPO_ID,
            userId: FAKE_USER_ID,
            workspaceId: FAKE_WORKSPACE_ID,
            defaultBranch: "main",
            ingestionStatus: "processing",
            ingestionStage: "chunking",
            save: async () => {},
        });

        Branch.findOne = async () => ({
            name: "main",
            latestCommitSha: COMMIT_SHA_1,
        });

        let prepareCalled = false;
        const mockPrepare = async () => {
            prepareCalled = true;
            return { submittedJob: { jobId: "job-999" } };
        };

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (c) => {
                statusCode = c;
                return res;
            },
            json: (p) => {
                responseJson = p;
            },
        };

        const req = { params: { repositoryId: FAKE_REPO_ID }, user: { _id: FAKE_USER_ID, accessToken: "token123" } };

        try {
            const controller = makeIngestRepository({ prepareAndSubmitIngestion: mockPrepare });
            await controller(req, res, () => {});

            assert.equal(statusCode, 200);
            assert.equal(responseJson.success, true);
            assert.equal(responseJson.alreadyProcessing, true);
            assert.equal(prepareCalled, false, "Prepare and submit should NOT be called for processing repo");
        } finally {
            Repository.findOne = originalRepoFindOne;
            Branch.findOne = originalBranchFindOne;
        }
    });

    it("3. COMPLETED repository for same commit SHA reuses existing ingestion without duplicate submission", async () => {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;

        Repository.findOne = async () => ({
            _id: FAKE_REPO_ID,
            userId: FAKE_USER_ID,
            workspaceId: FAKE_WORKSPACE_ID,
            defaultBranch: "main",
            ingestionStatus: "completed",
            lastIngestedCommitSha: COMMIT_SHA_1,
            chunkCount: 15,
            save: async () => {},
        });

        Branch.findOne = async () => ({
            name: "main",
            latestCommitSha: COMMIT_SHA_1,
        });

        let prepareCalled = false;
        const mockPrepare = async () => {
            prepareCalled = true;
            return { submittedJob: { jobId: "job-888" } };
        };

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (c) => {
                statusCode = c;
                return res;
            },
            json: (p) => {
                responseJson = p;
            },
        };

        const req = { params: { repositoryId: FAKE_REPO_ID }, user: { _id: FAKE_USER_ID, accessToken: "token123" } };

        try {
            const controller = makeIngestRepository({ prepareAndSubmitIngestion: mockPrepare });
            await controller(req, res, () => {});

            assert.equal(statusCode, 200);
            assert.equal(responseJson.success, true);
            assert.equal(responseJson.alreadyCompleted, true);
            assert.equal(prepareCalled, false, "Prepare and submit should NOT be called for same commit");
        } finally {
            Repository.findOne = originalRepoFindOne;
            Branch.findOne = originalBranchFindOne;
        }
    });

    it("4. New commit SHA allows fresh ingestion on a previously completed repository", async () => {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;

        let repoSaved = false;
        const mockRepo = {
            _id: FAKE_REPO_ID,
            userId: FAKE_USER_ID,
            workspaceId: FAKE_WORKSPACE_ID,
            defaultBranch: "main",
            ingestionStatus: "completed",
            lastIngestedCommitSha: COMMIT_SHA_1,
            save: async () => {
                repoSaved = true;
            },
        };

        Repository.findOne = async () => mockRepo;

        Branch.findOne = async () => ({
            name: "main",
            latestCommitSha: COMMIT_SHA_2,
        });

        let prepareCalled = false;
        const mockPrepare = async () => {
            prepareCalled = true;
            return { submittedJob: { jobId: "job-new-commit" } };
        };

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (c) => {
                statusCode = c;
                return res;
            },
            json: (p) => {
                responseJson = p;
            },
        };

        const req = { params: { repositoryId: FAKE_REPO_ID }, user: { _id: FAKE_USER_ID, accessToken: "token123" } };

        try {
            const controller = makeIngestRepository({ prepareAndSubmitIngestion: mockPrepare });
            await controller(req, res, () => {});

            assert.equal(statusCode, 202);
            assert.equal(responseJson.success, true);
            assert.equal(prepareCalled, true, "Prepare and submit SHOULD be called for new commit SHA");
            assert.equal(mockRepo.lastIngestedCommitSha, COMMIT_SHA_2);
            assert.equal(mockRepo.ingestionStatus, "processing");
            assert.equal(repoSaved, true);
        } finally {
            Repository.findOne = originalRepoFindOne;
            Branch.findOne = originalBranchFindOne;
        }
    });

    it("5. FAILED repository allows retry ingestion", async () => {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;

        const mockRepo = {
            _id: FAKE_REPO_ID,
            userId: FAKE_USER_ID,
            workspaceId: FAKE_WORKSPACE_ID,
            defaultBranch: "main",
            ingestionStatus: "failed",
            ingestionError: "Network timeout during chunking",
            save: async () => {},
        };

        Repository.findOne = async () => mockRepo;

        Branch.findOne = async () => ({
            name: "main",
            latestCommitSha: COMMIT_SHA_1,
        });

        let prepareCalled = false;
        const mockPrepare = async () => {
            prepareCalled = true;
            return { submittedJob: { jobId: "job-retry" } };
        };

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (c) => {
                statusCode = c;
                return res;
            },
            json: (p) => {
                responseJson = p;
            },
        };

        const req = { params: { repositoryId: FAKE_REPO_ID }, user: { _id: FAKE_USER_ID, accessToken: "token123" } };

        try {
            const controller = makeIngestRepository({ prepareAndSubmitIngestion: mockPrepare });
            await controller(req, res, () => {});

            assert.equal(statusCode, 202);
            assert.equal(responseJson.success, true);
            assert.equal(prepareCalled, true, "Failed repository allows retry ingestion");
            assert.equal(mockRepo.ingestionStatus, "processing");
        } finally {
            Repository.findOne = originalRepoFindOne;
            Branch.findOne = originalBranchFindOne;
        }
    });
});
