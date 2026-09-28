import "dotenv/config";
import mongoose from "mongoose";
import Commit from "../src/models/commits.model.js";
import File from "../src/models/files.model.js";
import { prepareAndSubmitAnalysis } from "../src/services/analysisPreparation.service.js";

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

const REPOSITORY_ID = new mongoose.Types.ObjectId().toString();
const BRANCH_ID = new mongoose.Types.ObjectId().toString();

const REPOSITORY = { _id: REPOSITORY_ID, owner: "seis-ai", name: "mazesolver" };
const BRANCH = { _id: BRANCH_ID, name: "main", latestCommitSha: "sha-head-1" };

function fakeGithubService(overrides = {}) {
    return {
        getBranchCommits: async () => {
            throw new Error("getBranchCommits should not be called -- commits are already synced");
        },
        getFileContent: async () => {
            throw new Error("getFileContent should not be called for this test");
        },
        getCommitDetail: async () => {
            throw new Error("getCommitDetail should not be called -- filesChanged is already populated");
        },
        ...overrides,
    };
}

function fakeFastapiClient(response) {
    const calls = [];
    return {
        calls,
        submitRepositoryAnalysis: async (repositoryId, payload) => {
            calls.push({ repositoryId, payload });
            return response;
        },
    };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI ANALYSIS EVIDENCE PREPARATION SUITE (Task 69)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. Only files that were actually changed are fetched, capped to the
    //    most-frequently-changed ones, and only real (still-existing) files.
    // ------------------------------------------------------------------
    console.log("1. Testing only real, frequently-changed files have content fetched...");
    {
        const originalCommitFind = Commit.find;
        const originalFileFind = File.find;

        Commit.find = async () => [
            {
                githubSha: "sha1",
                message: "fix: bug",
                filesChanged: ["backend/maze.py", "backend/maze.py"],
                author: { name: "Nikunj", email: "n@example.com" },
                committedAt: new Date("2026-08-01"),
            },
            {
                githubSha: "sha2",
                message: "chore: tidy",
                filesChanged: ["backend/maze.py", "README.md"],
                author: { name: "Nikunj", email: "n@example.com" },
                committedAt: new Date("2026-08-02"),
            },
            {
                githubSha: "sha3",
                message: "test: delete stale file reference",
                filesChanged: ["deleted/gone.py"],
                author: { name: "Nikunj", email: "n@example.com" },
                committedAt: new Date("2026-08-03"),
            },
        ];
        // Only backend/maze.py and README.md still exist as real files;
        // deleted/gone.py does not (simulating a since-removed file).
        File.find = async () => [
            { path: "backend/maze.py", language: "python", size: 500, type: "file" },
            { path: "README.md", language: "markdown", size: 200, type: "file" },
        ];

        let fetchedPaths = [];
        const github = fakeGithubService({
            getFileContent: async (_token, _owner, _repo, path) => {
                fetchedPaths.push(path);
                return { content: `content of ${path}` };
            },
        });
        const fastapi = fakeFastapiClient({
            success: true,
            generatedAt: "2026-08-29T00:00:00Z",
            hotspots: [],
            trends: { module_trends: [], high_churn_modules: [] },
            insights: [],
        });

        const result = await prepareAndSubmitAnalysis({
            repository: REPOSITORY,
            branch: BRANCH,
            accessToken: "tok",
            githubService: github,
            fastapiClient: fastapi,
        });

        assert(result.blocked === false, "evidence collection is not blocked when commits/branch are valid");
        assert(fetchedPaths.includes("backend/maze.py"), "content is fetched for a real, frequently-changed file");
        assert(fetchedPaths.includes("README.md"), "content is fetched for a real, less-frequently-changed file");
        assert(!fetchedPaths.includes("deleted/gone.py"), "no content is ever fetched for a file that no longer exists in the synced tree");
        assert(fastapi.calls.length === 1, "exactly one FastAPI analysis request occurs");
        assert(fastapi.calls[0].payload.analyzed_commit_sha === "sha-head-1", "the real branch head SHA is sent, never fabricated");
        assert(fastapi.calls[0].payload.commits.length === 3, "every real synced commit is included");
        assert(
            fastapi.calls[0].payload.files.find((f) => f.file_path === "backend/maze.py").content === "content of backend/maze.py",
            "real fetched file content is sent, never invented"
        );

        Commit.find = originalCommitFind;
        File.find = originalFileFind;
    }

    // ------------------------------------------------------------------
    // 2. No branch head SHA -> blocked, no GitHub/FastAPI call at all.
    // ------------------------------------------------------------------
    console.log("\n2. Testing a branch with no known commit SHA is blocked before any network call...");
    {
        const github = fakeGithubService();
        const fastapi = fakeFastapiClient({ success: true });

        const result = await prepareAndSubmitAnalysis({
            repository: REPOSITORY,
            branch: { ...BRANCH, latestCommitSha: null },
            accessToken: "tok",
            githubService: github,
            fastapiClient: fastapi,
        });

        assert(result.blocked === true, "a branch with no latestCommitSha is blocked");
        assert(fastapi.calls.length === 0, "no FastAPI request occurs when blocked");
    }

    // ------------------------------------------------------------------
    // 3. No commit history at all (empty Mongo + empty GitHub) -> blocked.
    // ------------------------------------------------------------------
    console.log("\n3. Testing zero commit history (never synced, GitHub also reports none) is blocked...");
    {
        const originalCommitFind = Commit.find;
        Commit.find = async () => [];

        const github = fakeGithubService({ getBranchCommits: async () => [] });
        const fastapi = fakeFastapiClient({ success: true });

        const result = await prepareAndSubmitAnalysis({
            repository: REPOSITORY,
            branch: BRANCH,
            accessToken: "tok",
            githubService: github,
            fastapiClient: fastapi,
        });

        assert(result.blocked === true, "zero commit history is blocked, not silently analyzed as empty");
        assert(fastapi.calls.length === 0, "no FastAPI request occurs when there is nothing to analyze");

        Commit.find = originalCommitFind;
    }

    // ------------------------------------------------------------------
    // 4. Real-world gap (live-discovered against Mazesolver): GitHub's
    //    list-commits API never returns files_changed, so already-synced
    //    commits can have `filesChanged: []` even though real churn
    //    happened. This must be enriched via a real per-commit detail
    //    fetch, not silently analyzed as "no changes ever happened".
    // ------------------------------------------------------------------
    console.log("\n4. Testing commits synced with empty filesChanged are enriched via a real commit-detail fetch...");
    {
        const originalCommitFind = Commit.find;
        const originalFileFind = File.find;
        const originalCommitFindOneAndUpdate = Commit.findOneAndUpdate;

        Commit.find = async () => [
            {
                githubSha: "sha1",
                message: "fix: real churn, but list API never reported it",
                filesChanged: [], // exactly the real Mazesolver gap
                author: { name: "Nikunj", email: "n@example.com" },
                committedAt: new Date("2026-08-01"),
            },
        ];
        File.find = async () => [{ path: "backend/maze.py", language: "python", size: 500, type: "file" }];
        Commit.findOneAndUpdate = async () => null; // best-effort persistence, not asserted on here

        let detailFetchedForSha = null;
        const github = fakeGithubService({
            getCommitDetail: async (_token, _owner, _repo, sha) => {
                detailFetchedForSha = sha;
                return {
                    files: [
                        { filename: "backend/maze.py", additions: 5, deletions: 1 },
                    ],
                };
            },
            getFileContent: async (_token, _owner, _repo, path) => ({ content: `content of ${path}` }),
        });
        const fastapi = fakeFastapiClient({
            success: true,
            generatedAt: "2026-08-29T00:00:00Z",
            hotspots: [],
            trends: { module_trends: [], high_churn_modules: [] },
            insights: [],
        });

        const result = await prepareAndSubmitAnalysis({
            repository: REPOSITORY,
            branch: BRANCH,
            accessToken: "tok",
            githubService: github,
            fastapiClient: fastapi,
        });

        assert(detailFetchedForSha === "sha1", "a real commit-detail fetch happens for a commit with empty filesChanged");
        assert(result.blocked === false, "the enriched commit still produces a real analysis run");
        assert(
            fastapi.calls[0].payload.commits[0].files_changed.includes("backend/maze.py"),
            "the real, enriched file-change list (from the detail fetch) reaches the analysis payload -- never fabricated"
        );
        assert(
            fastapi.calls[0].payload.files.find((f) => f.file_path === "backend/maze.py")?.content ===
                "content of backend/maze.py",
            "the newly-known changed file's real content is fetched and included"
        );

        Commit.find = originalCommitFind;
        File.find = originalFileFind;
        Commit.findOneAndUpdate = originalCommitFindOneAndUpdate;
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
