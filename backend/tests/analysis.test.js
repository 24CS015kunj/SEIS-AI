import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Repository from "../src/models/repositories.model.js";
import Analysis from "../src/models/analyses.model.js";
import Branch from "../src/models/branches.model.js";
import {
    makeGetRepositoryAnalysis,
    makeGenerateRepositoryAnalysis,
} from "../src/controllers/github.controller.js";
import app from "../src/app.js";

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

/** Minimal Express-like res double: chainable .status().json(), default 200. */
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

const OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_REPOSITORY_ID = new mongoose.Types.ObjectId().toString();
const TEST_REPOSITORY_ID_2 = new mongoose.Types.ObjectId().toString();
const TEST_BRANCH_ID = new mongoose.Types.ObjectId().toString();

const BASE_REPO = {
    _id: TEST_REPOSITORY_ID,
    userId: OWNER_USER_ID,
    owner: "seis-ai",
    name: "mazesolver",
    defaultBranch: "main",
};

const BASE_BRANCH = {
    _id: TEST_BRANCH_ID,
    repositoryId: TEST_REPOSITORY_ID,
    name: "main",
    isDefault: true,
    latestCommitSha: "sha-head-1",
};

function fakePrepareAndSubmitAnalysis(outcome) {
    const calls = [];
    return {
        calls,
        prepareAndSubmitAnalysis: async (params) => {
            calls.push(params);
            return outcome;
        },
    };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI REPOSITORY ANALYSIS SUITE (Task 69)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. GET with no persisted analysis returns an honest null, not 404.
    // ------------------------------------------------------------------
    console.log("1. Testing GET analysis with no persisted analysis returns success + null...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalAnalysisFindOne = Analysis.findOne;
        Repository.findOne = async () => ({ ...BASE_REPO });
        Analysis.findOne = () => ({ sort: async () => null });

        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "no persisted analysis still returns 200");
        assert(res.body.success === true, "response reports success");
        assert(res.body.analysis === null, "analysis is honestly null, never a fabricated placeholder");

        Repository.findOne = originalRepoFindOne;
        Analysis.findOne = originalAnalysisFindOne;
    }

    // ------------------------------------------------------------------
    // 2. GET with a completed, up-to-date analysis returns real findings,
    //    stale=false.
    // ------------------------------------------------------------------
    console.log("\n2. Testing GET analysis returns real persisted findings with stale=false when current...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalAnalysisFindOne = Analysis.findOne;
        const originalBranchFind = Branch.find;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [{ ...BASE_BRANCH }];
        const persisted = {
            _id: "analysis-1",
            status: "completed",
            model: "deterministic-evolution-v1",
            startedAt: new Date(),
            completedAt: new Date(),
            error: null,
            result: {
                analyzedCommitSha: "sha-head-1", // matches BASE_BRANCH.latestCommitSha
                analyzedCommitCount: 10,
                analyzedFileCount: 3,
                generatedAt: new Date().toISOString(),
                hotspots: [{ file_path: "backend/maze.py", commit_count: 12, line_count: 650, hotspot_score: 100 }],
                trends: { module_trends: [], high_churn_modules: [] },
                insights: [
                    {
                        category: "refactoring_recommended",
                        severity: "major",
                        subject: "backend/maze.py",
                        summary: "real summary",
                        recommendation: "real recommendation",
                    },
                ],
            },
        };
        Analysis.findOne = () => ({ sort: async () => persisted });

        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "a persisted analysis returns 200");
        assert(res.body.analysis.insights.length === 1, "real persisted insights are returned");
        assert(res.body.analysis.insights[0].subject === "backend/maze.py", "the real subject is returned, never fabricated");
        assert(res.body.stale === false, "an up-to-date analysis (matching branch head) is not marked stale");

        Repository.findOne = originalRepoFindOne;
        Analysis.findOne = originalAnalysisFindOne;
        Branch.find = originalBranchFind;
    }

    // ------------------------------------------------------------------
    // 3. GET marks a persisted analysis stale when the branch has moved.
    // ------------------------------------------------------------------
    console.log("\n3. Testing GET analysis marks stale=true when the branch has moved since...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalAnalysisFindOne = Analysis.findOne;
        const originalBranchFind = Branch.find;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [{ ...BASE_BRANCH, latestCommitSha: "sha-head-2-newer" }];
        const persisted = {
            _id: "analysis-1",
            status: "completed",
            result: { analyzedCommitSha: "sha-head-1", hotspots: [], trends: null, insights: [] },
        };
        Analysis.findOne = () => ({ sort: async () => persisted });

        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.body.stale === true, "a repository whose branch has moved past the analyzed commit is marked stale");
        assert(res.body.analysis.insights !== undefined, "the (now-stale) findings are still returned, not withheld");

        Repository.findOne = originalRepoFindOne;
        Analysis.findOne = originalAnalysisFindOne;
        Branch.find = originalBranchFind;
    }

    // ------------------------------------------------------------------
    // 4. Repository isolation: GET analysis for repo B never returns repo A's.
    // ------------------------------------------------------------------
    console.log("\n4. Testing GET analysis is scoped strictly by repositoryId (isolation)...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalAnalysisFindOne = Analysis.findOne;

        Repository.findOne = async (query) => ({ ...BASE_REPO, _id: query._id });
        let capturedQuery = null;
        Analysis.findOne = (query) => {
            capturedQuery = query;
            return { sort: async () => null };
        };

        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: TEST_REPOSITORY_ID_2 }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(
            String(capturedQuery.repositoryId) === TEST_REPOSITORY_ID_2,
            "the Analysis lookup is scoped to exactly the requested repositoryId, never another one"
        );

        Repository.findOne = originalRepoFindOne;
        Analysis.findOne = originalAnalysisFindOne;
    }

    // ------------------------------------------------------------------
    // 5. GET ownership enforcement.
    // ------------------------------------------------------------------
    console.log("\n5. Testing GET analysis enforces repository ownership...");
    {
        const originalRepoFindOne = Repository.findOne;
        Repository.findOne = async (query) => (String(query.userId) === OWNER_USER_ID ? { ...BASE_REPO } : null);

        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OTHER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting analysis for another user's repository gets 404");

        Repository.findOne = originalRepoFindOne;
    }

    // ------------------------------------------------------------------
    // 6. GET malformed repositoryId rejected with 400.
    // ------------------------------------------------------------------
    console.log("\n6. Testing GET analysis rejects a malformed repositoryId with 400...");
    {
        const handler = makeGetRepositoryAnalysis();
        const req = { params: { repositoryId: "not-a-valid-id" }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 400, "a malformed repository ID is rejected with 400");
    }

    // ------------------------------------------------------------------
    // 7. POST successfully generates and persists a real analysis.
    // ------------------------------------------------------------------
    console.log("\n7. Testing POST analysis generates, persists, and returns real findings...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;
        const originalAnalysisCreate = Analysis.create;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [{ ...BASE_BRANCH }];

        let savedDoc = null;
        Analysis.create = async (data) => {
            savedDoc = {
                ...data,
                save: async function () {
                    savedDoc = this;
                    return this;
                },
            };
            return savedDoc;
        };

        const prep = fakePrepareAndSubmitAnalysis({
            blocked: false,
            analyzedCommitSha: "sha-head-1",
            analyzedCommitCount: 10,
            analyzedFileCount: 2,
            contentFetchFailures: [],
            result: {
                success: true,
                generatedAt: "2026-08-29T00:00:00Z",
                hotspots: [{ file_path: "backend/maze.py", commit_count: 12, line_count: 650, hotspot_score: 100 }],
                trends: { module_trends: [], high_churn_modules: [] },
                insights: [
                    {
                        category: "refactoring_recommended",
                        severity: "major",
                        subject: "backend/maze.py",
                        summary: "real summary",
                        recommendation: "real recommendation",
                    },
                ],
            },
        });

        const handler = makeGenerateRepositoryAnalysis({ prepareAndSubmitAnalysis: prep.prepareAndSubmitAnalysis });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "a successful analysis generation returns 200");
        assert(res.body.success === true, "response reports success");
        assert(res.body.analysis.insights[0].subject === "backend/maze.py", "the real generated insight is returned");
        assert(savedDoc.status === "completed", "the persisted Analysis document is marked completed");
        assert(savedDoc.result.analyzedCommitSha === "sha-head-1", "the real analyzed commit SHA is persisted");
        assert(prep.calls.length === 1, "prepareAndSubmitAnalysis is called exactly once");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
        Analysis.create = originalAnalysisCreate;
    }

    // ------------------------------------------------------------------
    // 8. POST records a failed Analysis document when FastAPI fails --
    //    never substitutes fake insights.
    // ------------------------------------------------------------------
    console.log("\n8. Testing POST analysis records a failed status on FastAPI failure, never fake insights...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;
        const originalAnalysisCreate = Analysis.create;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [{ ...BASE_BRANCH }];

        let savedDoc = null;
        Analysis.create = async (data) => {
            savedDoc = { ...data, save: async function () { savedDoc = this; return this; } };
            return savedDoc;
        };

        const prep = fakePrepareAndSubmitAnalysis({
            blocked: false,
            result: { success: false, statusCode: 503, reason: "FastAPI analysis service unavailable." },
        });

        const handler = makeGenerateRepositoryAnalysis({ prepareAndSubmitAnalysis: prep.prepareAndSubmitAnalysis });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 503, "the real upstream failure status is forwarded");
        assert(res.body.success === false, "response reports failure");
        assert(res.body.analysis === undefined, "no fabricated analysis body is ever returned on failure");
        assert(savedDoc.status === "failed", "the persisted Analysis document is marked failed, not completed");
        assert(savedDoc.error === "FastAPI analysis service unavailable.", "the real failure reason is persisted");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
        Analysis.create = originalAnalysisCreate;
    }

    // ------------------------------------------------------------------
    // 9. POST with no synced branch is rejected cleanly, not crashed.
    // ------------------------------------------------------------------
    console.log("\n9. Testing POST analysis with no resolvable branch is rejected with 409...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [];

        const prep = fakePrepareAndSubmitAnalysis({ blocked: false, result: { success: true } });
        const handler = makeGenerateRepositoryAnalysis({
            prepareAndSubmitAnalysis: prep.prepareAndSubmitAnalysis,
            getRepositoryBranches: async () => [], // GitHub itself also reports zero branches
        });

        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 409, "no resolvable branch is rejected with 409");
        assert(prep.calls.length === 0, "prepareAndSubmitAnalysis is never called when no branch could be resolved");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
    }

    // ------------------------------------------------------------------
    // 10. HTTP-level auth boundary.
    // ------------------------------------------------------------------
    console.log("\n10. Testing the analysis routes require authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/analysis`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id/analysis rejects unauthenticated request with 401");
        }
        try {
            await axios.post(`${baseUrl}/api/github/repositories/123/analysis`);
        } catch (err) {
            assert(err.response.status === 401, "POST /api/github/repositories/:id/analysis rejects unauthenticated request with 401");
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("\n=========================================");
    console.log(`  TEST RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log("=========================================\n");

    if (testsFailed > 0) {
        process.exit(1);
    }
};

runAllTests().catch((err) => {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
});
