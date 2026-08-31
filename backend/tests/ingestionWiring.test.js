import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";
import { makeIngestRepository } from "../src/controllers/github.controller.js";
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

// A real-shaped ObjectId string -- the project's own established test
// convention (matches Repository/Branch/Workspace `_id` shape). It is
// used only inside this isolated unit-test fixture, never persisted as
// a production workspace (§Task 44 instruction 11).
const TEST_WORKSPACE_ID = new mongoose.Types.ObjectId().toString();
const OTHER_USER_ID = new mongoose.Types.ObjectId().toString();
const OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
// repositoryId always arrives as a URL param and must be a well-formed
// ObjectId string to pass ingestRepository's own format check before
// ever reaching the mocked Repository.findOne below.
const TEST_REPOSITORY_ID = new mongoose.Types.ObjectId().toString();
const TEST_REPOSITORY_ID_2 = new mongoose.Types.ObjectId().toString();

function fakeGithubService({ tree, contentByPath = {} } = {}) {
    return {
        getRepositoryTree: async () => ({ tree, truncated: false }),
        getFileContent: async (_token, _owner, _repo, path) => ({
            path,
            content: contentByPath[path] ?? null,
            sha: `sha-${path}`,
        }),
    };
}

function fakeFastapiClient() {
    const calls = [];
    return {
        calls,
        submitIngestionManifest: async (repositoryId, manifest) => {
            calls.push({ repositoryId, manifest });
            return {
                success: true,
                jobId: `job-${calls.length}`,
                status: "pending",
                repositoryId,
                submittedAt: new Date().toISOString(),
            };
        },
    };
}

function treeEntry(path, overrides = {}) {
    return { path, type: "blob", sha: `sha-${path}`, size: 100, ...overrides };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI INGESTION WIRING SUITE (Task 44)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. Repository with a valid workspaceId: it is read from Repository,
    //    reaches prepareAndSubmitIngestion, and reaches the FastAPI
    //    request body unchanged.
    // ------------------------------------------------------------------
    console.log("1. Testing a valid Repository.workspaceId flows through to the FastAPI request...");
    {
        const originalFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;

        Repository.findOne = async (query) => {
            if (String(query.userId) !== OWNER_USER_ID) return null;
            return {
                _id: TEST_REPOSITORY_ID,
                userId: OWNER_USER_ID,
                owner: "seis-ai",
                name: "seis-ai-copilot",
                defaultBranch: "main",
                workspaceId: TEST_WORKSPACE_ID,
            };
        };
        Branch.findOne = async () => ({ name: "main", latestCommitSha: "abc123def456" });

        const tree = [treeEntry("src/app.py")];
        const github = fakeGithubService({ tree, contentByPath: { "src/app.py": "print(1)" } });
        const fastapi = fakeFastapiClient();

        const handler = makeIngestRepository({});
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: {},
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();

        // Inject the GitHub/FastAPI boundaries the same way
        // ingestionPreparation.service.js's own tests already do, by
        // wiring them through prepareAndSubmitIngestionImpl below --
        // exercising the REAL prepareAndSubmitIngestion, not a stub of it.
        const { prepareAndSubmitIngestion } = await import("../src/services/ingestionPreparation.service.js");
        const wiredHandler = makeIngestRepository({
            prepareAndSubmitIngestion: (params) =>
                prepareAndSubmitIngestion({ ...params, githubService: github, fastapiClient: fastapi }),
        });

        await wiredHandler(req, res, () => {});

        assert(res.statusCode === 202, "successful ingestion returns 202 Accepted");
        assert(fastapi.calls.length === 1, "exactly one FastAPI submission occurs");
        assert(
            fastapi.calls[0].manifest.workspace_id === TEST_WORKSPACE_ID,
            "the FastAPI request body's workspace_id exactly matches Repository.workspaceId"
        );
        assert(
            fastapi.calls[0].manifest.commit_sha === "abc123def456",
            "the FastAPI request body's commit_sha matches the synced Branch.latestCommitSha"
        );
        assert(
            fastapi.calls[0].manifest.files.length === 1 &&
                fastapi.calls[0].manifest.files[0].content === "print(1)",
            "all eligible files are present in the single manifest"
        );
        assert(res.body.submittedJob != null, "the response reports the submitted job");

        Repository.findOne = originalFindOne;
        Branch.findOne = originalBranchFindOne;
    }

    // ------------------------------------------------------------------
    // 2. Repository with workspaceId null: ingestion is blocked before
    //    any GitHub content fetch or FastAPI/Celery involvement.
    // ------------------------------------------------------------------
    console.log("\n2. Testing a Repository with workspaceId: null blocks ingestion...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async (query) => {
            if (String(query.userId) !== OWNER_USER_ID) return null;
            return {
                _id: TEST_REPOSITORY_ID_2,
                userId: OWNER_USER_ID,
                owner: "seis-ai",
                name: "no-workspace-repo",
                defaultBranch: "main",
                workspaceId: null,
            };
        };

        let githubTreeCalled = false;
        const github = {
            getRepositoryTree: async () => {
                githubTreeCalled = true;
                return { tree: [] };
            },
        };
        const fastapi = { calls: [], submitIngestionManifest: async () => ({ success: true }) };

        const { prepareAndSubmitIngestion } = await import("../src/services/ingestionPreparation.service.js");
        const handler = makeIngestRepository({
            prepareAndSubmitIngestion: (params) =>
                prepareAndSubmitIngestion({ ...params, githubService: github, fastapiClient: fastapi }),
        });

        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID_2 },
            body: {},
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 409, "a repository with no workspace association is rejected with 409");
        assert(
            res.body.message.toLowerCase().includes("workspace"),
            "the error message explains the repository has no workspace association"
        );
        assert(githubTreeCalled === false, "no GitHub content fetch occurs after the missing-workspace check");
        assert(fastapi.calls.length === 0, "no FastAPI request occurs");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 3. Repository ownership: another user's repository cannot be
    //    ingested merely by knowing its ID.
    // ------------------------------------------------------------------
    console.log("\n3. Testing repository ownership is enforced...");
    {
        const originalFindOne = Repository.findOne;
        // Simulates the real Mongoose query semantics: {_id, userId} must
        // both match, so a different user's query returns nothing.
        Repository.findOne = async (query) => {
            if (String(query.userId) === OWNER_USER_ID) {
                return {
                    _id: TEST_REPOSITORY_ID,
                    userId: OWNER_USER_ID,
                    owner: "seis-ai",
                    name: "seis-ai-copilot",
                    defaultBranch: "main",
                    workspaceId: TEST_WORKSPACE_ID,
                };
            }
            return null;
        };

        const handler = makeIngestRepository({});
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: {},
            user: { _id: OTHER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting ingestion of another user's repository gets 404");
        assert(
            res.body.message.includes("access denied") || res.body.message.includes("not found"),
            "the rejection does not leak whether the repository exists for a different owner"
        );

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 4. No caller spoofing: a request-body workspaceId must never
    //    override the repository's persisted value.
    // ------------------------------------------------------------------
    console.log("\n4. Testing a spoofed request-body workspaceId is ignored...");
    {
        const originalFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        Repository.findOne = async () => ({
            _id: TEST_REPOSITORY_ID,
            userId: OWNER_USER_ID,
            owner: "seis-ai",
            name: "seis-ai-copilot",
            defaultBranch: "main",
            workspaceId: TEST_WORKSPACE_ID,
        });
        Branch.findOne = async () => ({ name: "main", latestCommitSha: "abc123def456" });

        const tree = [treeEntry("src/app.py")];
        const github = fakeGithubService({ tree, contentByPath: { "src/app.py": "print(1)" } });
        const fastapi = fakeFastapiClient();
        const { prepareAndSubmitIngestion } = await import("../src/services/ingestionPreparation.service.js");
        const handler = makeIngestRepository({
            prepareAndSubmitIngestion: (params) =>
                prepareAndSubmitIngestion({ ...params, githubService: github, fastapiClient: fastapi }),
        });

        const spoofedWorkspaceId = new mongoose.Types.ObjectId().toString();
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            // A caller-supplied workspaceId in the body, deliberately
            // different from the repository's real, persisted one.
            body: { workspaceId: spoofedWorkspaceId },
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(
            spoofedWorkspaceId !== TEST_WORKSPACE_ID,
            "sanity check: the spoofed and real workspace IDs are genuinely different"
        );
        assert(fastapi.calls.length === 1, "ingestion still proceeds (the spoofed value doesn't block it)");
        assert(
            fastapi.calls[0].manifest.workspace_id === TEST_WORKSPACE_ID,
            "the FastAPI request carries the repository's real, persisted workspace_id"
        );
        assert(
            fastapi.calls[0].manifest.workspace_id !== spoofedWorkspaceId,
            "the spoofed request-body workspaceId never reaches the FastAPI request"
        );

        Repository.findOne = originalFindOne;
        Branch.findOne = originalBranchFindOne;
    }

    // ------------------------------------------------------------------
    // 5. Existing ingestion behavior preserved: correct commit SHA, all
    //    eligible files in one manifest, exactly one FastAPI request.
    // ------------------------------------------------------------------
    console.log("\n5. Testing existing one-manifest/one-request ingestion behavior is preserved...");
    {
        const originalFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        Repository.findOne = async () => ({
            _id: TEST_REPOSITORY_ID,
            userId: OWNER_USER_ID,
            owner: "seis-ai",
            name: "seis-ai-copilot",
            defaultBranch: "main",
            workspaceId: TEST_WORKSPACE_ID,
        });
        Branch.findOne = async () => ({ name: "main", latestCommitSha: "sha-xyz" });

        const tree = Array.from({ length: 30 }, (_, i) => treeEntry(`file${i}.py`));
        const contentByPath = Object.fromEntries(tree.map((t) => [t.path, "x"]));
        const github = fakeGithubService({ tree, contentByPath });
        const fastapi = fakeFastapiClient();
        const { prepareAndSubmitIngestion } = await import("../src/services/ingestionPreparation.service.js");
        const handler = makeIngestRepository({
            prepareAndSubmitIngestion: (params) =>
                prepareAndSubmitIngestion({ ...params, githubService: github, fastapiClient: fastapi }),
        });

        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: {},
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(fastapi.calls.length === 1, "exactly one FastAPI request is made for 30 eligible files");
        assert(fastapi.calls[0].manifest.files.length === 30, "all 30 eligible files are present in that one manifest");
        assert(fastapi.calls[0].manifest.commit_sha === "sha-xyz", "commit SHA is correctly propagated");
        assert(res.statusCode === 202, "the endpoint reports 202 Accepted");

        Repository.findOne = originalFindOne;
        Branch.findOne = originalBranchFindOne;
    }

    // ------------------------------------------------------------------
    // 6. FastAPI failure: existing retry/error behavior is unchanged --
    //    a rejected submission surfaces as a gateway failure, not a
    //    silently-swallowed error.
    // ------------------------------------------------------------------
    console.log("\n6. Testing FastAPI submission failure surfaces correctly...");
    {
        const originalFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        Repository.findOne = async () => ({
            _id: TEST_REPOSITORY_ID,
            userId: OWNER_USER_ID,
            owner: "seis-ai",
            name: "seis-ai-copilot",
            defaultBranch: "main",
            workspaceId: TEST_WORKSPACE_ID,
        });
        Branch.findOne = async () => ({ name: "main", latestCommitSha: "sha-xyz" });

        const tree = [treeEntry("a.py")];
        const github = fakeGithubService({ tree, contentByPath: { "a.py": "x" } });
        const fastapi = {
            calls: [],
            submitIngestionManifest: async (repositoryId, manifest) => {
                fastapi.calls.push({ repositoryId, manifest });
                return {
                    success: false,
                    statusCode: 422,
                    errorCode: "BUSINESS_RULE_VIOLATION",
                    reason: "Repository already undergoing processing.",
                    retryable: false,
                    attempts: 1,
                };
            },
        };
        const { prepareAndSubmitIngestion } = await import("../src/services/ingestionPreparation.service.js");
        const handler = makeIngestRepository({
            prepareAndSubmitIngestion: (params) =>
                prepareAndSubmitIngestion({ ...params, githubService: github, fastapiClient: fastapi }),
        });

        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: {},
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 502, "a rejected FastAPI submission surfaces as 502 (upstream gateway failure)");
        assert(res.body.success === false, "the response reports failure, not a silently-swallowed success");
        assert(
            res.body.failures.some((f) => f.stage === "fastapi_submission" && f.statusCode === 422),
            "the 422 rejection reason is preserved in the response"
        );

        Repository.findOne = originalFindOne;
        Branch.findOne = originalBranchFindOne;
    }

    // ------------------------------------------------------------------
    // 7. No synced branch: a clear error, not a crash or a fabricated
    //    branch/commit.
    // ------------------------------------------------------------------
    console.log("\n7. Testing a repository with no synced branch is rejected cleanly...");
    {
        const originalFindOne = Repository.findOne;
        const originalBranchFindOne = Branch.findOne;
        Repository.findOne = async () => ({
            _id: TEST_REPOSITORY_ID,
            userId: OWNER_USER_ID,
            owner: "seis-ai",
            name: "seis-ai-copilot",
            defaultBranch: "main",
            workspaceId: TEST_WORKSPACE_ID,
        });
        Branch.findOne = async () => null;

        const handler = makeIngestRepository({});
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: {},
            user: { _id: OWNER_USER_ID, accessToken: "gho_test" },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 400, "a repository with no synced branch record is rejected with 400");

        Repository.findOne = originalFindOne;
        Branch.findOne = originalBranchFindOne;
    }

    // ------------------------------------------------------------------
    // 8. HTTP-level auth boundary (matches existing verify.test.js
    //    convention: only the unauthenticated-rejection path is
    //    exercised over a real HTTP server).
    // ------------------------------------------------------------------
    console.log("\n8. Testing the ingest route requires authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.post(`${baseUrl}/api/github/repositories/123/ingest`);
        } catch (err) {
            assert(
                err.response.status === 401,
                "POST /api/github/repositories/:id/ingest rejects unauthenticated request with 401"
            );
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
