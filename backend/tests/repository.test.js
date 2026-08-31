import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Repository from "../src/models/repositories.model.js";
import { getRepository } from "../src/controllers/github.controller.js";
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

const BASE_REPO = {
    _id: TEST_REPOSITORY_ID,
    userId: OWNER_USER_ID,
    owner: "seis-ai",
    name: "mazesolver",
    fullName: "seis-ai/mazesolver",
    description: "A maze solving toy project",
    defaultBranch: "main",
    language: "Python",
    stars: 3,
    forks: 1,
    openIssues: 0,
    visibility: "public",
    htmlUrl: "https://github.com/seis-ai/mazesolver",
    lastFetchedAt: new Date(),
    workspaceId: null,
};

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI SINGLE REPOSITORY LOOKUP SUITE (Task 71)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. A real, owned repository resolves with its real identity.
    // ------------------------------------------------------------------
    console.log("1. Testing a real, owned repository resolves with real identity...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async (query) => {
            if (String(query.userId) !== OWNER_USER_ID) return null;
            if (String(query._id) !== TEST_REPOSITORY_ID) return null;
            return { ...BASE_REPO };
        };

        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID } };
        const res = mockRes();
        await getRepository(req, res, () => {});

        assert(res.statusCode === 200, "a real, owned repository returns 200");
        assert(res.body.success === true, "response reports success");
        assert(res.body.repository.name === "mazesolver" && res.body.repository.owner === "seis-ai", "real name/owner are returned");
        assert(res.body.repository.defaultBranch === "main", "real defaultBranch is returned");
        assert(res.body.repository.id === TEST_REPOSITORY_ID, "the real Mongo id is returned as `id`");
        assert(res.body.repository.userId === undefined, "internal fields like userId are never leaked to the client");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 2. A nonexistent repository ID -> honest 404, never fabricated data.
    // ------------------------------------------------------------------
    console.log("\n2. Testing a nonexistent repository ID returns a clean 404...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async () => null;

        const fakeId = new mongoose.Types.ObjectId().toString();
        const req = { params: { repositoryId: fakeId }, user: { _id: OWNER_USER_ID } };
        const res = mockRes();
        await getRepository(req, res, () => {});

        assert(res.statusCode === 404, "a nonexistent repository ID is rejected with 404");
        assert(res.body.repository === undefined, "no repository object -- real or fabricated -- is ever returned on 404");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 3. Repository ownership is enforced -- a real repository ID owned by
    //    a different user is never returned (isolation).
    // ------------------------------------------------------------------
    console.log("\n3. Testing repository ownership is enforced...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async (query) => (String(query.userId) === OWNER_USER_ID ? { ...BASE_REPO } : null);

        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OTHER_USER_ID } };
        const res = mockRes();
        await getRepository(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting a real repository ID gets 404, not another user's data");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 4. A malformed repositoryId is rejected before any DB call.
    // ------------------------------------------------------------------
    console.log("\n4. Testing a malformed repositoryId is rejected with 400...");
    {
        const req = { params: { repositoryId: "not-a-valid-id" }, user: { _id: OWNER_USER_ID } };
        const res = mockRes();
        await getRepository(req, res, () => {});

        assert(res.statusCode === 400, "a malformed repository ID is rejected with 400");
    }

    // ------------------------------------------------------------------
    // 5. Two different real repositories resolve to their own, distinct
    //    real identities -- never cross-contaminated.
    // ------------------------------------------------------------------
    console.log("\n5. Testing two different repositories resolve independently...");
    {
        const originalFindOne = Repository.findOne;
        const REPO_B_ID = new mongoose.Types.ObjectId().toString();
        Repository.findOne = async (query) => {
            const id = String(query._id);
            if (id === TEST_REPOSITORY_ID) return { ...BASE_REPO };
            if (id === REPO_B_ID) return { ...BASE_REPO, _id: REPO_B_ID, name: "other-repo", owner: "someone-else" };
            return null;
        };

        const resA = mockRes();
        await getRepository({ params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID } }, resA, () => {});
        const resB = mockRes();
        await getRepository({ params: { repositoryId: REPO_B_ID }, user: { _id: OWNER_USER_ID } }, resB, () => {});

        assert(resA.body.repository.name === "mazesolver", "repository A resolves to its own real name");
        assert(resB.body.repository.name === "other-repo", "repository B resolves to its own real, different name");
        assert(resA.body.repository.name !== resB.body.repository.name, "the two never resolve to the same identity");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 6. HTTP-level auth boundary.
    // ------------------------------------------------------------------
    console.log("\n6. Testing the repository lookup route requires authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.get(`${baseUrl}/api/github/repositories/123`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id rejects unauthenticated request with 401");
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
