import "dotenv/config";
import {
    prepareAndSubmitIngestion,
    classifyTreeEntries,
    GITHUB_INLINE_CONTENT_LIMIT_BYTES,
} from "../src/services/ingestionPreparation.service.js";
import { submitIngestionManifest, isRetryableError } from "../src/services/fastapiClient.service.js";

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

const REPO = { _id: "repo-mongo-id-1", owner: "seis-ai", name: "seis-ai-copilot" };
const BRANCH = { name: "main", latestCommitSha: "abc123def456" };

function treeEntry(path, overrides = {}) {
    return { path, type: "blob", sha: `sha-${path}`, size: 100, ...overrides };
}

function fakeGithubService({ tree, contentByPath = {}, failPaths = new Set() } = {}) {
    return {
        getRepositoryTree: async () => ({ tree, truncated: false }),
        getFileContent: async (_token, _owner, _repo, path) => {
            if (failPaths.has(path)) {
                const err = new Error(`GitHub error fetching ${path}`);
                err.statusCode = 502;
                throw err;
            }
            return { path, content: contentByPath[path] ?? null, sha: `sha-${path}` };
        },
    };
}

function fakeFastapiClient({ behavior = "success" } = {}) {
    const calls = [];
    return {
        calls,
        submitIngestionManifest: async (repositoryId, manifest) => {
            calls.push({ repositoryId, manifest });
            if (behavior === "success") {
                return {
                    success: true,
                    jobId: `job-${calls.length}`,
                    status: "pending",
                    repositoryId,
                    submittedAt: new Date().toISOString(),
                };
            }
            if (behavior === "4xx") {
                return {
                    success: false,
                    statusCode: 422,
                    errorCode: "BUSINESS_RULE_VIOLATION",
                    reason: "Repository already undergoing processing.",
                    retryable: false,
                    attempts: 1,
                };
            }
            if (behavior === "5xx") {
                return {
                    success: false,
                    statusCode: 503,
                    errorCode: "QUEUE_ERROR",
                    reason: "Broker unreachable.",
                    retryable: true,
                    attempts: 4,
                };
            }
            throw new Error(`unknown fake behavior: ${behavior}`);
        },
    };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI INGESTION PREPARATION SUITE   ");
    console.log("=========================================\n");

    // 1. classifyTreeEntries
    console.log("1. Testing file classification (unsupported/directory filtering)...");
    {
        const { eligible, skipped } = classifyTreeEntries([
            treeEntry("src/app.py"),
            treeEntry("assets/logo.png"),
            treeEntry("src", { type: "tree", size: 0 }),
            treeEntry("README.md"),
        ]);
        assert(eligible.length === 2, "eligible files exclude directories and unsupported extensions");
        assert(eligible.map((f) => f.path).includes("src/app.py"), "recognized-language file marked eligible");
        assert(eligible.map((f) => f.path).includes("README.md"), "markdown file marked eligible");
        assert(
            skipped.find((s) => s.path === "src")?.reason === "directory",
            "directory entries skipped with reason 'directory'"
        );
        assert(
            skipped.find((s) => s.path === "assets/logo.png")?.reason === "unsupported_language",
            "unrecognized-extension file skipped with reason 'unsupported_language'"
        );
    }

    // 2. Empty repository
    console.log("\n2. Testing empty repository handling...");
    {
        const github = fakeGithubService({ tree: [] });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        assert(result.filesDiscovered === 0, "empty repository reports 0 files discovered");
        assert(result.filesEligible === 0, "empty repository reports 0 eligible files");
        assert(result.submittedJob === null, "empty repository submits no job");
        assert(fastapi.calls.length === 0, "empty repository never calls FastAPI");
    }

    // 3. Content fetching + oversized files
    console.log("\n3. Testing content fetching, including oversized-file handling...");
    {
        const tree = [
            treeEntry("a.py", { size: 100 }),
            treeEntry("huge.py", { size: GITHUB_INLINE_CONTENT_LIMIT_BYTES + 1 }),
        ];
        const github = fakeGithubService({ tree, contentByPath: { "a.py": "print(1)" } });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        const sentFiles = fastapi.calls[0].manifest.files;
        assert(sentFiles.find((f) => f.path === "a.py")?.content === "print(1)", "normal file content fetched and sent");
        assert(
            sentFiles.find((f) => f.path === "huge.py")?.content === null,
            "oversized file sent with content: null (never fetched from GitHub, matches ManifestFile contract)"
        );
        assert(result.filesEligible === 2, "oversized file still counted as eligible, not skipped");
    }

    // 4. GitHub API failure during content fetch
    console.log("\n4. Testing GitHub API failure during content fetch...");
    {
        const tree = [treeEntry("a.py"), treeEntry("b.py")];
        const github = fakeGithubService({
            tree,
            contentByPath: { "a.py": "ok" },
            failPaths: new Set(["b.py"]),
        });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        assert(
            result.failures.some((f) => f.path === "b.py" && f.stage === "content_fetch"),
            "GitHub content-fetch failure recorded in failures, not silently dropped"
        );
        assert(
            !fastapi.calls[0].manifest.files.some((f) => f.path === "b.py"),
            "file that failed to fetch is excluded from the submitted manifest"
        );
        assert(
            fastapi.calls[0].manifest.files.some((f) => f.path === "a.py"),
            "sibling file unaffected by another file's fetch failure"
        );
    }

    // 5. Multiple files (25) -- one manifest, one request, all files included
    console.log("\n5. Testing multiple (25) files produce exactly one manifest...");
    {
        const tree = Array.from({ length: 25 }, (_, i) => treeEntry(`file${i}.py`));
        const contentByPath = Object.fromEntries(tree.map((t) => [t.path, "x"]));
        const github = fakeGithubService({ tree, contentByPath });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        assert(fastapi.calls.length === 1, "25 eligible files result in exactly ONE FastAPI request");
        assert(fastapi.calls[0].manifest.files.length === 25, "the single request carries all 25 eligible files");
        assert(
            fastapi.calls[0].manifest.workspace_id === "ws-1" && fastapi.calls[0].manifest.commit_sha === "abc123def456",
            "the manifest carries the given workspace_id/commit_sha"
        );
        assert(result.submittedJob !== null && result.submittedJob.fileCount === 25, "submittedJob reports the full file count");
    }

    // 5b. Large repository (100+ files) -- still exactly one manifest, one request
    console.log("\n5b. Testing a 100+ file repository still produces exactly one manifest...");
    {
        const FILE_COUNT = 137;
        const tree = Array.from({ length: FILE_COUNT }, (_, i) => treeEntry(`src/module${i}.py`));
        const contentByPath = Object.fromEntries(tree.map((t) => [t.path, `content-${t.path}`]));
        const github = fakeGithubService({ tree, contentByPath });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
            fetchConcurrency: 10,
        });
        assert(
            fastapi.calls.length === 1,
            "verify exactly ONE FastAPI request is made for a repository containing many (137) files"
        );
        assert(
            fastapi.calls[0].manifest.files.length === FILE_COUNT,
            "verify the request contains ALL eligible files, none dropped by artificial batching"
        );
        assert(
            new Set(fastapi.calls[0].manifest.files.map((f) => f.path)).size === FILE_COUNT,
            "verify no artificial batching occurs at the HTTP boundary (no duplicate/split submissions)"
        );
        assert(result.filesEligible === FILE_COUNT, "filesEligible matches the full file count");
        assert(result.submittedJob.fileCount === FILE_COUNT, "submittedJob.fileCount matches the full file count");

        // A second call for the same repository (e.g. a retry trigger from
        // the caller) must still only ever make ONE request per call --
        // there is no hidden re-submission loop for the same repository.
        const secondResult = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
            fetchConcurrency: 10,
        });
        assert(
            fastapi.calls.length === 2,
            "verify no second FastAPI request is made as part of the SAME ingestion attempt (a distinct caller-initiated attempt is call #2, not a second batch of attempt #1)"
        );
        assert(secondResult.submittedJob !== null, "second, independent ingestion attempt also submits exactly one manifest");
    }

    // 6. Missing workspace_id -- STOP CONDITION
    console.log("\n6. Testing the missing-workspace_id stop condition...");
    {
        const tree = [treeEntry("a.py")];
        const github = fakeGithubService({ tree, contentByPath: { "a.py": "x" } });
        const fastapi = fakeFastapiClient();
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: undefined,
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        assert(result.blocked === true, "missing workspace_id sets blocked: true");
        assert(
            result.blockedReason === "Express → FastAPI integration is blocked by the missing workspace concept.",
            "blocked reason matches the exact required message"
        );
        assert(fastapi.calls.length === 0, "no FastAPI call is made when workspace_id is missing");
        assert(result.filesEligible === 1, "diagnostic counts are still computed even when blocked");
    }

    // 6b. FastAPI rejects with 422 (e.g. Task 30's in-flight-job lock) --
    // must NOT retry and must NOT submit a second job for the same repo.
    console.log("\n6b. Testing that a 422 from FastAPI is recorded, not retried or resubmitted...");
    {
        const tree = [treeEntry("a.py")];
        const github = fakeGithubService({ tree, contentByPath: { "a.py": "x" } });
        const fastapi = fakeFastapiClient({ behavior: "4xx" });
        const result = await prepareAndSubmitIngestion({
            repository: REPO,
            branch: BRANCH,
            accessToken: "gho_test",
            workspaceId: "ws-1",
            githubService: github,
            fastapiClient: fastapi,
            config: { maxRetries: 3, retryBaseDelayMs: 1 },
        });
        assert(fastapi.calls.length === 1, "a 422 response results in exactly one FastAPI call, never a second submission");
        assert(result.submittedJob === null, "submittedJob is null when the submission is rejected");
        assert(
            result.failures.some((f) => f.stage === "fastapi_submission" && f.statusCode === 422),
            "the 422 rejection is recorded in failures with its status code"
        );
    }

    // 7. FastAPI client -- success (202)
    console.log("\n7. Testing FastAPI client: successful submission (202)...");
    {
        const httpClient = {
            post: async () => ({
                status: 202,
                data: { repository_id: "repo-1", job_id: "task-abc", status: "pending", submitted_at: "2026-01-01T00:00:00Z" },
            }),
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 3, retryBaseDelayMs: 1 } }
        );
        assert(result.success === true, "202 response yields success: true");
        assert(result.jobId === "task-abc", "job_id extracted correctly");
        assert(result.status === "pending", "status extracted correctly");
    }

    // 8. FastAPI client -- 4xx not retried
    console.log("\n8. Testing FastAPI client: 4xx is not retried...");
    {
        let callCount = 0;
        const httpClient = {
            post: async () => {
                callCount += 1;
                const err = new Error("Unprocessable");
                err.response = { status: 422, data: { error: { code: "BUSINESS_RULE_VIOLATION", message: "already processing" } } };
                throw err;
            },
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 3, retryBaseDelayMs: 1 } }
        );
        assert(result.success === false && result.statusCode === 422, "422 surfaces as a failure with statusCode 422");
        assert(callCount === 1, "422 is attempted exactly once, never retried");
        assert(result.errorCode === "BUSINESS_RULE_VIOLATION", "error code extracted from FastAPI's error envelope");
    }

    // 9. FastAPI client -- 5xx retried then succeeds
    console.log("\n9. Testing FastAPI client: 5xx triggers bounded retry...");
    {
        let callCount = 0;
        const httpClient = {
            post: async () => {
                callCount += 1;
                if (callCount < 3) {
                    const err = new Error("Service Unavailable");
                    err.response = { status: 503, data: {} };
                    throw err;
                }
                return { status: 202, data: { repository_id: "repo-1", job_id: "task-xyz", status: "pending", submitted_at: "now" } };
            },
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 3, retryBaseDelayMs: 1 } }
        );
        assert(result.success === true, "5xx followed by success eventually succeeds");
        assert(callCount === 3, "exactly 2 retries were needed (3 total attempts)");
    }

    // 10. FastAPI client -- retries exhausted
    console.log("\n10. Testing FastAPI client: retries exhausted on persistent 5xx...");
    {
        let callCount = 0;
        const httpClient = {
            post: async () => {
                callCount += 1;
                const err = new Error("Bad Gateway");
                err.response = { status: 502, data: {} };
                throw err;
            },
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 2, retryBaseDelayMs: 1 } }
        );
        assert(result.success === false, "persistent 5xx eventually surfaces as a failure");
        assert(callCount === 3, "maxRetries=2 results in exactly 3 attempts (1 initial + 2 retries)");
        assert(result.retryable === true, "failure is flagged as having been retryable");
    }

    // 11. FastAPI client -- timeout is retryable
    console.log("\n11. Testing FastAPI client: timeout is treated as retryable...");
    {
        const err = new Error("timeout of 5000ms exceeded");
        err.code = "ECONNABORTED";
        assert(isRetryableError(err) === true, "ECONNABORTED (timeout) classified as retryable");

        let callCount = 0;
        const httpClient = {
            post: async () => {
                callCount += 1;
                throw err;
            },
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 1, retryBaseDelayMs: 1 } }
        );
        assert(callCount === 2, "timeout is retried (1 initial + 1 retry with maxRetries=1)");
        assert(result.errorCode === "TIMEOUT", "timeout failure classified with errorCode TIMEOUT");
    }

    // 12. FastAPI client -- malformed response
    console.log("\n12. Testing FastAPI client: malformed 2xx response...");
    {
        const httpClient = {
            post: async () => ({ status: 202, data: { unexpected: "shape" } }),
        };
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: "secret", timeoutMs: 5000, maxRetries: 3, retryBaseDelayMs: 1 } }
        );
        assert(result.success === false, "a 2xx response missing job_id/status is not treated as success");
        assert(result.errorCode === "MALFORMED_RESPONSE", "malformed response classified explicitly");
    }

    // 13. FastAPI client -- missing credentials
    console.log("\n13. Testing FastAPI client: missing FASTAPI_INTERNAL_API_KEY...");
    {
        let capturedHeaders = null;
        const httpClient = {
            post: async (_url, _body, requestConfig) => {
                capturedHeaders = requestConfig.headers;
                return { status: 202, data: { repository_id: "repo-1", job_id: "task-1", status: "pending", submitted_at: "now" } };
            },
        };
        await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient, config: { baseUrl: "http://fastapi:8000", internalApiKey: null, timeoutMs: 5000, maxRetries: 3, retryBaseDelayMs: 1 } }
        );
        assert(
            !("Authorization" in capturedHeaders),
            "no Authorization header sent when FASTAPI_INTERNAL_API_KEY is unset (mirrors FastAPI's own dev-mode passthrough)"
        );
    }

    // 14. FastAPI client -- missing FASTAPI_BASE_URL entirely
    console.log("\n14. Testing FastAPI client: missing FASTAPI_BASE_URL...");
    {
        const result = await submitIngestionManifest(
            "repo-1",
            { workspace_id: "ws-1", commit_sha: "abc", files: [] },
            { httpClient: { post: async () => { throw new Error("should not be called"); } }, config: { baseUrl: null, maxRetries: 3, retryBaseDelayMs: 1, timeoutMs: 5000 } }
        );
        assert(result.success === false && result.errorCode === "MISSING_CONFIG", "missing FASTAPI_BASE_URL fails fast with a clear config error, no request attempted");
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
