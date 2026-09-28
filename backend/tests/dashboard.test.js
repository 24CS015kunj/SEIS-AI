import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";
import Commit from "../src/models/commits.model.js";
import File from "../src/models/files.model.js";
import { makeGetDashboard } from "../src/controllers/github.controller.js";
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
const TEST_BRANCH_ID = new mongoose.Types.ObjectId().toString();

const BASE_REPO = {
    _id: TEST_REPOSITORY_ID,
    userId: OWNER_USER_ID,
    owner: "seis-ai",
    name: "mazesolver",
    fullName: "seis-ai/mazesolver",
    defaultBranch: "main",
    language: "Python",
    description: null,
    stars: 3,
    forks: 1,
    openIssues: 0,
    visibility: "public",
    htmlUrl: "https://github.com/seis-ai/mazesolver",
    lastFetchedAt: new Date(),
    workspaceId: null,
};

const BASE_BRANCH = {
    _id: TEST_BRANCH_ID,
    repositoryId: TEST_REPOSITORY_ID,
    name: "main",
    isDefault: true,
    isProtected: false,
    latestCommitSha: "abc123",
};

const BASE_FILES = [
    { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID, path: "backend", type: "directory" },
    { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID, path: "backend/maze.py", type: "file", size: 1200 },
    { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID, path: "frontend/app.js", type: "file", size: 800 },
    { repositoryId: TEST_REPOSITORY_ID, branchId: TEST_BRANCH_ID, path: "package.json", type: "file", size: 300 },
];

function noOpGithubService(overrides = {}) {
    return {
        getRepositoryBranches: async () => {
            throw new Error("getRepositoryBranches should not be called when branches are already synced");
        },
        getRepositoryTree: async () => {
            throw new Error("getRepositoryTree should not be called when files are already synced");
        },
        getBranchCommits: async () => {
            throw new Error("getBranchCommits should not be called when commits are already synced");
        },
        getRepositoryLanguages: async () => ({ Python: 8000, JavaScript: 2000 }),
        getRepositoryContributors: async () => [
            { login: "alex-dev", avatar_url: "https://x/a", contributions: 42, html_url: "https://github.com/alex-dev" },
            { login: "sarah-eng", avatar_url: "https://x/b", contributions: 9, html_url: "https://github.com/sarah-eng" },
        ],
        getFileContent: async () => ({ content: JSON.stringify({ dependencies: { axios: "^1.0.0" }, devDependencies: { nodemon: "^3.0.0" } }) }),
        ...overrides,
    };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI DASHBOARD AGGREGATION SUITE (Task 68)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. Fully-synced repository: every section is real, no live GitHub
    //    branch/tree/commit calls happen (already-synced Mongo data wins),
    //    languages/contributors/dependencies are always fetched live.
    // ------------------------------------------------------------------
    console.log("1. Testing a fully-synced repository returns real, non-fabricated data...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;
        const originalFileFind = File.find;
        const originalCommitFind = Commit.find;

        Repository.findOne = async (query) => (String(query.userId) === OWNER_USER_ID ? { ...BASE_REPO } : null);
        Branch.find = async () => [{ ...BASE_BRANCH }];
        File.find = async () => BASE_FILES.map((f) => ({ ...f }));
        Commit.find = async () => [
            {
                githubSha: "sha1",
                message: "Fix maze generation bug",
                author: { name: "Alex Dev", username: "alex-dev" },
                committedAt: new Date(),
                commitUrl: "https://github.com/seis-ai/mazesolver/commit/sha1",
            },
        ];

        const github = noOpGithubService();
        const handler = makeGetDashboard(github);
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "a fully-synced repository returns 200");
        assert(res.body.success === true, "response reports success");
        assert(res.body.repository.name === "mazesolver" && res.body.repository.owner === "seis-ai", "real repository identity is returned");
        assert(res.body.branch.name === "main", "the real default branch is resolved");

        assert(res.body.files.available === true && res.body.files.fileCount === 3, "file count reflects only type=file entries (3), not directories");
        assert(res.body.files.count === 4, "total entry count includes the directory entry too");

        assert(
            res.body.architecture.available === true &&
                res.body.architecture.directories.some((d) => d.path === "backend" && d.fileCount === 1) &&
                res.body.architecture.directories.some((d) => d.path === "frontend" && d.fileCount === 1),
            "architecture reflects real top-level directories with real file counts"
        );
        assert(res.body.architecture.rootFileCount === 1, "package.json at root is counted as a root-level file, not a directory");
        assert(
            !res.body.architecture.directories[0].relationships,
            "no fabricated dependency relationships are ever attached to a directory"
        );

        assert(res.body.languages.available === true, "languages are reported as available");
        const pct = res.body.languages.breakdown.reduce((sum, l) => sum + l.percent, 0);
        assert(Math.abs(pct - 100) < 0.5, `language percentages sum to ~100 (got ${pct})`);
        assert(res.body.languages.breakdown[0].name === "Python", "language breakdown is sorted by real byte count, largest first");

        assert(res.body.dependencies.available === true && res.body.dependencies.count === 2, "dependency count is derived from the real fetched package.json (1 dep + 1 devDep)");
        assert(res.body.dependencies.ecosystem === "npm", "npm ecosystem is reported for package.json");

        assert(res.body.contributors.available === true && res.body.contributors.total === 2, "real contributor count from GitHub is returned");
        assert(res.body.contributors.top[0].login === "alex-dev" && res.body.contributors.top[0].contributions === 42, "contributors are sorted by real contribution count, descending");

        assert(res.body.activity.available === true && res.body.activity.commits[0].message === "Fix maze generation bug", "real synced commit is returned as activity");

        assert(res.body.linesOfCode.available === false, "Lines of Code is always honestly reported as unavailable -- never fabricated from byte size");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
        File.find = originalFileFind;
        Commit.find = originalCommitFind;
    }

    // ------------------------------------------------------------------
    // 2. No manifest present -> dependencies stay honestly unavailable,
    //    and no file-content call is ever made.
    // ------------------------------------------------------------------
    console.log("\n2. Testing dependencies stay 'not available' when no root manifest exists...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;
        const originalFileFind = File.find;
        const originalCommitFind = Commit.find;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [{ ...BASE_BRANCH }];
        File.find = async () => [BASE_FILES[0], BASE_FILES[1], BASE_FILES[2]]; // no package.json
        Commit.find = async () => [];

        let fileContentCalled = false;
        const github = noOpGithubService({
            getFileContent: async () => {
                fileContentCalled = true;
                return { content: "{}" };
            },
            getBranchCommits: async () => [],
        });
        const handler = makeGetDashboard(github);
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.body.dependencies.available === false, "dependencies.available is false with no root manifest");
        assert(res.body.dependencies.count === null, "dependencies.count is null, never a fabricated 0 or guessed number");
        assert(!fileContentCalled, "no file-content fetch happens when no recognized manifest exists");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
        File.find = originalFileFind;
        Commit.find = originalCommitFind;
    }

    // ------------------------------------------------------------------
    // 3. Repository ownership is enforced identically to every other
    //    repository-scoped route in this controller.
    // ------------------------------------------------------------------
    console.log("\n3. Testing repository ownership is enforced...");
    {
        const originalRepoFindOne = Repository.findOne;
        Repository.findOne = async (query) => (String(query.userId) === OWNER_USER_ID ? { ...BASE_REPO } : null);

        const handler = makeGetDashboard(noOpGithubService());
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OTHER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting the dashboard for another user's repository gets 404");

        Repository.findOne = originalRepoFindOne;
    }

    // ------------------------------------------------------------------
    // 4. A malformed repositoryId is rejected before any DB/GitHub call.
    // ------------------------------------------------------------------
    console.log("\n4. Testing a malformed repositoryId is rejected with 400...");
    {
        const handler = makeGetDashboard(noOpGithubService());
        const req = { params: { repositoryId: "not-a-valid-id" }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 400, "a malformed repository ID is rejected with 400");
    }

    // ------------------------------------------------------------------
    // 5. No branch could be resolved at all (repository never synced,
    //    GitHub returns no branches) -- every section reports honestly
    //    unavailable rather than throwing or fabricating placeholder data.
    // ------------------------------------------------------------------
    console.log("\n5. Testing an unsynced repository with zero branches returns an honest empty state...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;

        Repository.findOne = async () => ({ ...BASE_REPO });
        Branch.find = async () => [];

        const github = noOpGithubService({ getRepositoryBranches: async () => [] });
        const handler = makeGetDashboard(github);
        const req = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 200, "an unsynced repository still returns 200, not an error");
        assert(res.body.branch === null, "branch is honestly null when none could be resolved");
        assert(res.body.files.available === false, "files.available is false rather than fabricated");
        assert(res.body.architecture.available === false, "architecture.available is false rather than fabricated");
        assert(res.body.contributors.available === false, "contributors.available is false when no branch/downstream data exists");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
    }

    // ------------------------------------------------------------------
    // 6. HTTP-level auth boundary (matches the rest of this controller's
    //    tests: only the unauthenticated-rejection path over a real server).
    // ------------------------------------------------------------------
    console.log("\n6. Testing the dashboard route requires authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/dashboard`);
        } catch (err) {
            assert(
                err.response.status === 401,
                "GET /api/github/repositories/:id/dashboard rejects unauthenticated request with 401"
            );
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    // ------------------------------------------------------------------
    // 7. Repository isolation (Task 69): a second repository's dashboard
    //    -- including its architecture/directory data, which the new
    //    Architecture page reuses directly -- never reflects the first
    //    repository's data, even when both are owned by the same user.
    // ------------------------------------------------------------------
    console.log("\n7. Testing architecture/directory data is isolated per repository...");
    {
        const originalRepoFindOne = Repository.findOne;
        const originalBranchFind = Branch.find;
        const originalFileFind = File.find;
        const originalCommitFind = Commit.find;

        const REPO_B_ID = new mongoose.Types.ObjectId().toString();
        const BRANCH_B_ID = new mongoose.Types.ObjectId().toString();

        Repository.findOne = async (query) => {
            const id = String(query._id);
            if (id === TEST_REPOSITORY_ID) return { ...BASE_REPO };
            if (id === REPO_B_ID) return { ...BASE_REPO, _id: REPO_B_ID, name: "other-repo" };
            return null;
        };
        Branch.find = async (query) => {
            const repoId = String(query.repositoryId);
            if (repoId === TEST_REPOSITORY_ID) return [{ ...BASE_BRANCH }];
            if (repoId === REPO_B_ID) return [{ ...BASE_BRANCH, _id: BRANCH_B_ID, repositoryId: REPO_B_ID }];
            return [];
        };
        File.find = async (query) => {
            const repoId = String(query.repositoryId);
            if (repoId === TEST_REPOSITORY_ID) return BASE_FILES.map((f) => ({ ...f }));
            if (repoId === REPO_B_ID) {
                return [
                    { repositoryId: REPO_B_ID, branchId: BRANCH_B_ID, path: "docs/readme.md", type: "file", size: 50 },
                ];
            }
            return [];
        };
        Commit.find = async () => [];

        const github = noOpGithubService({ getBranchCommits: async () => [] });
        const handler = makeGetDashboard(github);

        const resA = mockRes();
        await handler(
            { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } },
            resA,
            () => {}
        );
        const resB = mockRes();
        await handler(
            { params: { repositoryId: REPO_B_ID }, user: { _id: OWNER_USER_ID, accessToken: "tok" } },
            resB,
            () => {}
        );

        assert(
            resA.body.architecture.directories.some((d) => d.path === "backend"),
            "repository A's own real directories are returned for repository A"
        );
        assert(
            !resB.body.architecture.directories.some((d) => d.path === "backend"),
            "repository B's response never includes repository A's directories"
        );
        assert(
            resB.body.architecture.directories.some((d) => d.path === "docs"),
            "repository B's own real, different directory is returned for repository B"
        );
        assert(resA.body.repository.name === "mazesolver" && resB.body.repository.name === "other-repo", "each response carries its own real repository identity");

        Repository.findOne = originalRepoFindOne;
        Branch.find = originalBranchFind;
        File.find = originalFileFind;
        Commit.find = originalCommitFind;
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
