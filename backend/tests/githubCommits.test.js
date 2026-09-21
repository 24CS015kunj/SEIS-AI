import "dotenv/config";
import mongoose from "mongoose";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";
import Commit from "../src/models/commits.model.js";
import { makeGetBranches, makeGetCommits } from "../src/controllers/github.controller.js";

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
const TEST_BRANCH_ID = new mongoose.Types.ObjectId().toString();

const BASE_REPO = {
    _id: TEST_REPOSITORY_ID,
    userId: OWNER_USER_ID,
    owner: "real-owner",
    name: "real-repo",
    fullName: "real-owner/real-repo",
    defaultBranch: "main",
};

const BASE_BRANCH = {
    _id: TEST_BRANCH_ID,
    repositoryId: TEST_REPOSITORY_ID,
    name: "main",
};

/**
 * Real shape `handleGitHubError` (github.service.js) throws for a GitHub
 * 401 -- this is the exact, live-confirmed error a revoked/invalid stored
 * GitHub access token produces (verified against the real GitHub API
 * during this task's investigation: a genuinely revoked token returns
 * `401 Bad credentials`, and `handleGitHubError` wraps that into this
 * message/statusCode pair). Never fabricates a token value -- only the
 * error shape GitHub's own API response produces.
 */
function githubAuthError() {
    const err = new Error("GitHub Authentication failed: Bad credentials");
    err.statusCode = 401;
    return err;
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI GITHUB COMMITS/BRANCHES AUTH SUITE   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. Valid GitHub authentication -> branches (and therefore, per the
    //    real frontend's own sequencing, commits) can be fetched.
    // ------------------------------------------------------------------
    console.log("1. Testing valid GitHub credentials return real branches...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchUpdate = Branch.findOneAndUpdate;
        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.findOneAndUpdate = async (query, update) => ({ ...BASE_BRANCH, ...update });

        let calledWith = null;
        const handler = makeGetBranches({
            getRepositoryBranches: async (accessToken, owner, repo) => {
                calledWith = { accessToken, owner, repo };
                return [{ name: "main", protected: false, commit: { sha: "abc123" } }];
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "gho_valid_token_value" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "valid GitHub credentials return 200");
        assert(res.body.success === true, "response reports success");
        assert(res.body.branches.length === 1 && res.body.branches[0].name === "main", "real branch data is returned");
        assert(calledWith.owner === "real-owner" && calledWith.repo === "real-repo", "correct repository owner/name (Repository identity) is passed to the GitHub call, not fabricated");
        assert(calledWith.accessToken === "gho_valid_token_value", "the requesting user's own stored access token is passed through");

        Repository.findOne = originalRepoFindOne;
        Branch.findOneAndUpdate = originalBranchUpdate;
    }

    // ------------------------------------------------------------------
    // 2. Invalid/revoked GitHub credentials -> a real 401 "GitHub
    //    Authentication failed" error, not a generic 500 or a silently
    //    swallowed failure. This is the exact, live-confirmed failure
    //    mode found in this task's investigation (GitHub's own API
    //    rejecting a genuinely revoked stored access token).
    // ------------------------------------------------------------------
    console.log("\n2. Testing invalid/revoked GitHub credentials surface a real authentication error...");
    {
        const originalRepoFindOne = Repository.findOne;
        Repository.findOne = async () => ({ ...BASE_REPO });

        const handler = makeGetBranches({
            getRepositoryBranches: async () => {
                throw githubAuthError();
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "gho_revoked_token_value" } };
        const res = mockRes();
        let nextError = null;
        await handler(req, res, (err) => {
            nextError = err;
        });

        assert(nextError !== null, "the GitHub authentication failure is forwarded to Express's error handler, not swallowed");
        assert(nextError.statusCode === 401, "the forwarded error carries HTTP 401, matching GitHub's own real response");
        assert(nextError.message === "GitHub Authentication failed: Bad credentials", "the real GitHub error message is preserved, not replaced with a generic string");
        assert(!nextError.message.includes("gho_revoked_token_value"), "the raw access token value never appears in the error message");

        Repository.findOne = originalRepoFindOne;
    }

    // ------------------------------------------------------------------
    // 3. Missing GitHub credentials (no stored accessToken at all) -- the
    //    same failure path as #2 today (an undefined token still produces
    //    a real GitHub 401), documented here as the actual current
    //    behavior rather than an invented distinct code path.
    // ------------------------------------------------------------------
    console.log("\n3. Testing a repository owner with no stored GitHub access token...");
    {
        const originalRepoFindOne = Repository.findOne;
        Repository.findOne = async () => ({ ...BASE_REPO });

        let receivedToken = "not-called";
        const handler = makeGetBranches({
            getRepositoryBranches: async (accessToken) => {
                receivedToken = accessToken;
                throw githubAuthError();
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: undefined } };
        const res = mockRes();
        let nextError = null;
        await handler(req, res, (err) => {
            nextError = err;
        });

        assert(receivedToken === undefined, "an absent access token is passed through as-is, never a fabricated placeholder value");
        assert(nextError?.statusCode === 401, "a missing access token surfaces the same real authentication-error status as an invalid one");

        Repository.findOne = originalRepoFindOne;
    }

    // ------------------------------------------------------------------
    // 4. A non-owner requesting another user's repository never reaches
    //    GitHub at all (ownership is checked first).
    // ------------------------------------------------------------------
    console.log("\n4. Testing repository ownership is enforced before any GitHub call...");
    {
        const originalRepoFindOne = Repository.findOne;
        Repository.findOne = async (query) => (String(query.userId) === OWNER_USER_ID ? { ...BASE_REPO } : null);

        let githubCalled = false;
        const handler = makeGetBranches({
            getRepositoryBranches: async () => {
                githubCalled = true;
                return [];
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OTHER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting another user's repository gets 404");
        assert(githubCalled === false, "no GitHub API call is made for a repository the caller doesn't own");

        Repository.findOne = originalRepoFindOne;
    }

    // ------------------------------------------------------------------
    // 5. Commits endpoint: valid credentials return real, persisted
    //    commits, with the correct repository/branch identity.
    // ------------------------------------------------------------------
    console.log("\n5. Testing valid GitHub credentials return real commits...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        const originalCommitFind = Commit.find;
        const originalCommitCount = Commit.countDocuments;
        const originalCommitUpdate = Commit.findOneAndUpdate;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.findOne = async () => ({ ...BASE_BRANCH });
        Commit.findOneAndUpdate = async (query, update) => ({ ...update });
        Commit.countDocuments = async () => 1;
        // `Commit.find(...)` is used two different ways in the real
        // controller: awaited directly (the "existing enriched commits"
        // lookup, expects an array) and chained via `.sort().skip().limit()`
        // (the final paginated list). A thenable chain object supports both
        // call shapes without duplicating the mock per call site.
        const REAL_COMMIT = { githubSha: "abc123", message: "real commit", repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID };
        Commit.find = () => {
            const chain = {
                sort: () => chain,
                skip: () => chain,
                limit: async () => [REAL_COMMIT],
                then: (resolve) => resolve([]),
            };
            return chain;
        };

        let calledWith = null;
        const handler = makeGetCommits({
            getBranchCommits: async (accessToken, owner, repo) => {
                calledWith = { owner, repo };
                return [{ sha: "abc123", commit: { message: "real commit", author: { date: new Date().toISOString() } } }];
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID }, query: {}, user: { _id: OWNER_USER_ID, accessToken: "gho_valid_token_value" } };
        const res = mockRes();
        let nextErr = null;
        await handler(req, res, (err) => {
            nextErr = err;
        });

        assert(nextErr === null, `commits endpoint did not error: ${nextErr?.message}`);
        assert(res.body?.success === true, "valid GitHub credentials return a successful response from the commits endpoint");
        assert(res.body?.commits.length === 1, "real commit data is returned");
        assert(calledWith.owner === "real-owner" && calledWith.repo === "real-repo", "correct repository identity is used for the commits call");

        Repository.findOne = originalRepoFindOne;
        Branch.findOne = originalBranchFindOne;
        Commit.find = originalCommitFind;
        Commit.countDocuments = originalCommitCount;
        Commit.findOneAndUpdate = originalCommitUpdate;
    }

    // ------------------------------------------------------------------
    // 6. Commits endpoint: invalid GitHub credentials surface the same
    //    real authentication error as branches, never a fabricated empty
    //    commit list (an auth failure must never look like "no commits").
    // ------------------------------------------------------------------
    console.log("\n6. Testing invalid GitHub credentials on the commits endpoint surface a real authentication error...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.findOne = async () => ({ ...BASE_BRANCH });

        const handler = makeGetCommits({
            getBranchCommits: async () => {
                throw githubAuthError();
            },
        });
        const req = { params: { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID }, query: {}, user: { _id: OWNER_USER_ID, accessToken: "gho_revoked_token_value" } };
        const res = mockRes();
        let nextError = null;
        await handler(req, res, (err) => {
            nextError = err;
        });

        assert(nextError?.statusCode === 401, "the commits endpoint forwards the real 401 authentication error");
        assert(nextError?.message === "GitHub Authentication failed: Bad credentials", "the real GitHub error message reaches Express's error handler unchanged");
        assert(res.body === null, "no fabricated success/empty-commits response is sent when GitHub authentication fails");

        Repository.findOne = originalRepoFindOne;
        Branch.findOne = originalBranchFindOne;
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
