import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { makeAnalyzeCommitImpact } from "../src/controllers/github.controller.js";

describe("SEIS-AI COMMIT IMPACT ANALYSIS SUITE (Task #4)", () => {
    it("1. Returns 400 for invalid repository ID format", async () => {
        const req = {
            params: { repositoryId: "invalid-id", commitSha: "sha-1" },
            user: { _id: new mongoose.Types.ObjectId() },
        };
        let responseStatus = null;
        let responseJson = null;
        const res = {
            status: (code) => {
                responseStatus = code;
                return {
                    json: (data) => { responseJson = data; },
                };
            },
        };

        const handler = makeAnalyzeCommitImpact();
        await handler(req, res, () => {});

        assert.equal(responseStatus, 400);
        assert.equal(responseJson.success, false);
        assert.equal(responseJson.message, "Invalid repository ID format.");
    });

    it("2. Successfully invokes commit impact service and returns structured risk response", async () => {
        const repoId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();

        const stubSubmitImpact = async (repositoryId, payload) => {
            return {
                success: true,
                repositoryId,
                commitSha: payload.commit.commit_sha,
                riskScore: 35.0,
                riskLevel: "MEDIUM",
                filesChangedCount: 2,
                breakingChanges: [],
                affectedModules: ["src/auth"],
                recommendations: ["Review changes"],
                analyzedAt: new Date().toISOString(),
            };
        };

        const req = {
            params: { repositoryId: String(repoId), commitSha: "sha-100" },
            body: { filesChanged: ["src/auth/jwt.js", "src/auth/config.js"] },
            user: { _id: userId },
        };

        let responseJson = null;
        const res = {
            json: (data) => { responseJson = data; },
            status: () => res,
        };

        // Inject stub Repository lookup and service implementation
        const mockDeps = {
            submitCommitImpactAnalysis: stubSubmitImpact,
        };

        // Mock Repository.findOne for test
        const originalFindOne = mongoose.Model.findOne;
        mongoose.Model.findOne = async function (query) {
            if (query._id && String(query._id) === String(repoId)) {
                return { _id: repoId, userId, name: "demo-repo" };
            }
            return null;
        };

        try {
            const handler = makeAnalyzeCommitImpact(mockDeps);
            await handler(req, res, () => {});

            assert.equal(responseJson.success, true);
            assert.equal(responseJson.commitSha, "sha-100");
            assert.equal(responseJson.riskLevel, "MEDIUM");
            assert.equal(responseJson.riskScore, 35.0);
        } finally {
            mongoose.Model.findOne = originalFindOne;
        }
    });
});
