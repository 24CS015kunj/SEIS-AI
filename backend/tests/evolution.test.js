import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeGenerateEvolutionAnalysis } from "../src/controllers/github.controller.js";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";

describe("SEIS-AI SOFTWARE EVOLUTION SUITE (Task #9)", () => {
    it("1. Returns 400 for invalid repository ID format", async () => {
        const req = { params: { repositoryId: "invalid_id" }, user: { _id: "u1" } };
        let statusCode = null;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            json: (payload) => {
                responseJson = payload;
            },
        };

        const controller = makeGenerateEvolutionAnalysis();
        await controller(req, res, () => {});

        assert.equal(statusCode, 400);
        assert.equal(responseJson.success, false);
    });

    it("2. Successfully invokes evolution analysis pipeline and returns report payload", async () => {
        const fakeRepoId = "507f1f77bcf86cd799439011";
        const fakeUserId = "507f1f77bcf86cd799439022";
        const fakeBranchId = "507f1f77bcf86cd799439033";

        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;

        Repository.findOne = async () => ({
            _id: fakeRepoId,
            userId: fakeUserId,
            owner: "testowner",
            name: "testrepo",
            defaultBranch: "main",
        });

        Branch.find = async () => [
            {
                _id: fakeBranchId,
                repositoryId: fakeRepoId,
                name: "main",
                isDefault: true,
                latestCommitSha: "abc123sha",
            },
        ];

        const mockPrepareAndSubmit = async () => ({
            blocked: false,
            analyzedCommitSha: "abc123sha",
            analyzedCommitCount: 15,
            analyzedFileCount: 5,
            result: {
                success: true,
                repositoryId: fakeRepoId,
                totalCommits: 15,
                hotspots: [{ file_path: "src/app.js", hotspot_score: 85 }],
                trends: { high_churn_modules: ["src/"] },
                insights: [],
            },
        });

        const mockGetBranches = async () => [
            { name: "main", protected: false, commit: { sha: "abc123sha" } },
        ];

        let statusCode = 200;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            json: (payload) => {
                responseJson = payload;
            },
        };

        const req = {
            params: { repositoryId: fakeRepoId },
            user: { _id: fakeUserId, accessToken: "token123" },
            query: {},
            correlationId: "corr-evolution-999",
        };

        try {
            const controller = makeGenerateEvolutionAnalysis({
                prepareAndSubmit: mockPrepareAndSubmit,
                getRepositoryBranches: mockGetBranches,
            });
            await controller(req, res, () => {});

            assert.equal(statusCode, 200);
            assert.equal(responseJson.success, true);
            assert.equal(responseJson.analyzedCommitCount, 15);
            assert.equal(responseJson.hotspots.length, 1);
        } finally {
            Repository.findOne = originalRepoFindOne;
            Branch.find = originalBranchFind;
        }
    });
});
