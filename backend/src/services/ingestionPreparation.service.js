/**
 * Repository ingestion preparation (Task 37, revised by Task 39).
 *
 * Fetches file metadata + content via the existing GitHub service,
 * filters out unsupported/directory entries, and submits ALL eligible
 * files as ONE RepositoryManifest via fastapiClient.service.js. No
 * GitHub integration or Mongoose schema is duplicated here --
 * getRepositoryTree/getFileContent and detectLanguage are all reused
 * as-is from the existing modules.
 *
 * Task 39: this module previously split eligible files into multiple
 * HTTP-level batches, each submitted as its own top-level FastAPI
 * ingestion request. That is incompatible with Task 30's
 * one-active-job-per-repository lock (the first batch succeeds, every
 * subsequent batch is rejected with 422). Per Task 38's resolution,
 * one repository ingestion attempt now always produces exactly one
 * FastAPI request carrying every eligible file. Any future batching
 * for very large repositories belongs inside Task 40's worker, which
 * receives the single manifest and may process it incrementally --
 * not here.
 *
 * GitHub content, once fetched, is held only in memory for the
 * duration of this call and forwarded to FastAPI -- never written to
 * MongoDB (§Task 37 instruction 8; MongoDB Atlas Free tier stores
 * metadata only).
 */

import * as githubServiceReal from "./github.service.js";
import * as fastapiClientReal from "./fastapiClient.service.js";
import { detectLanguage } from "../controllers/github.controller.js";
import { getFastapiConfig } from "../config/fastapi.config.js";
import Repository from "../models/repositories.model.js";

/**
 * Auto-fails stuck ingestion jobs older than maxAgeMinutes (Task #7).
 * @param {number} [maxAgeMinutes=20]
 * @returns {Promise<number>} Number of stuck jobs updated
 */
export async function cleanupStuckIngestions(maxAgeMinutes = 20) {
    try {
        const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
        const result = await Repository.updateMany(
            {
                ingestionStatus: "processing",
                updatedAt: { $lt: cutoff },
            },
            {
                $set: {
                    ingestionStatus: "failed",
                    ingestionError: `Ingestion job timed out after ${maxAgeMinutes} minutes.`,
                    ingestionStage: "failed",
                },
            }
        );
        return result.modifiedCount || 0;
    } catch (err) {
        console.error("[Ingestion Watchdog Error]", err.message);
        return 0;
    }
}

/**
 * GitHub's Contents API (used by getFileContent) does not return inline
 * base64 content for files above this size -- confirmed, documented
 * GitHub behavior, not a value invented for this task. Pre-checking it
 * against already-known tree metadata (`size`) avoids an API call we
 * already know will come back with content: null.
 */
export const GITHUB_INLINE_CONTENT_LIMIT_BYTES = 1_000_000;

const DEFAULT_FETCH_CONCURRENCY = 10;

const IGNORED_PATH_PATTERNS = [
    /(?:^|\/)(?:node_modules|\.git|\.venv|dist|build|coverage|__pycache__|\.next|\.output|vendor|target|out|scratch|tmp|\.gemini)\//i,
    /\.(min\.js|min\.css|map|lock|lockb|bundle\.js)$/i,
];

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * Classifies raw GitHub tree entries into eligible files vs. skipped
 * entries, filtering directories, ignored paths (node_modules, dist, etc.),
 * and unsupported languages.
 */
export function classifyTreeEntries(treeEntries) {
    const eligible = [];
    const skipped = [];

    for (const entry of treeEntries) {
        if (entry.type === "tree") {
            skipped.push({ path: entry.path, reason: "directory" });
            continue;
        }

        const isIgnored = IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(entry.path));
        if (isIgnored) {
            skipped.push({ path: entry.path, reason: "ignored_path" });
            continue;
        }

        const language = detectLanguage(entry.path);
        if (language === null) {
            skipped.push({ path: entry.path, reason: "unsupported_language" });
            continue;
        }

        eligible.push({
            path: entry.path,
            sha: entry.sha,
            size: entry.size || 0,
            language,
        });
    }

    return { eligible, skipped };
}

/**
 * Fetches content for one eligible file. Distinguishes three outcomes:
 *  - genuine fetch failure (network/GitHub error) -> recorded as a
 *    failure, file dropped from the batch (we don't know its content
 *    and won't guess), per instruction 7 ("without silently losing
 *    files" -- it's reported, not dropped silently).
 *  - GitHub has no inline content for it (oversized/binary, confirmed
 *    by the size pre-check or by GitHub itself) -> included in the
 *    batch with content: null, exactly matching ManifestFile's own
 *    documented "None for oversized/binary originals" contract.
 *  - normal text file -> included with real content.
 */
async function fetchFileContent(file, { accessToken, owner, repo, ref, githubService }) {
    if (file.size > GITHUB_INLINE_CONTENT_LIMIT_BYTES) {
        return { file, content: null, failure: null };
    }

    try {
        const result = await githubService.getFileContent(accessToken, owner, repo, file.path, ref);
        return { file, content: result?.content ?? null, failure: null };
    } catch (error) {
        return {
            file,
            content: null,
            failure: { path: file.path, reason: error.message, statusCode: error.statusCode || null },
        };
    }
}

/**
 * Prepares and submits a repository for AI ingestion.
 *
 * @param {object} params
 * @param {{_id: string, owner: string, name: string}} params.repository
 * @param {{name: string, latestCommitSha: string|null}} params.branch
 * @param {string} params.accessToken - GitHub token for content fetch (existing flow, reused)
 * @param {string|null|undefined} params.workspaceId - MUST come from a real caller-supplied
 *   value. Never defaulted/invented here (§Task 37 instruction 12).
 * @param {object} [params.githubService] - injectable (tests only); defaults to the real module
 * @param {object} [params.fastapiClient] - injectable (tests only); defaults to the real module
 * @param {object} [params.config] - injectable (tests only); defaults to getFastapiConfig()
 * @param {number} [params.fetchConcurrency]
 */
export async function prepareAndSubmitIngestion({
    repository,
    branch,
    accessToken,
    workspaceId,
    githubService = githubServiceReal,
    fastapiClient = fastapiClientReal,
    config = getFastapiConfig(),
    fetchConcurrency = DEFAULT_FETCH_CONCURRENCY,
}) {
    const repositoryId = String(repository._id);

    if (!branch.latestCommitSha) {
        throw new Error(
            `Branch '${branch.name}' has no known commit SHA yet -- sync branches before requesting ingestion.`
        );
    }
    const commitSha = branch.latestCommitSha;

    const treeData = await githubService.getRepositoryTree(
        accessToken,
        repository.owner,
        repository.name,
        commitSha,
        { recursive: true }
    );
    const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];

    const { eligible, skipped } = classifyTreeEntries(treeEntries);

    const baseResult = {
        repositoryId,
        commitSha,
        filesDiscovered: treeEntries.length,
        filesEligible: eligible.length,
        filesSkipped: skipped.length,
        skippedFiles: skipped,
    };

    // Hard stop per instruction 12/STOP CONDITION -- no default, no
    // fabricated value, checked before any content fetch or FastAPI call.
    if (!workspaceId) {
        return {
            ...baseResult,
            blocked: true,
            blockedReason: "Express → FastAPI integration is blocked by the missing workspace concept.",
            submittedJob: null,
            failures: [],
        };
    }

    if (eligible.length === 0) {
        return {
            ...baseResult,
            blocked: false,
            submittedJob: null,
            failures: [],
        };
    }

    const fetchResults = await mapWithConcurrency(eligible, fetchConcurrency, (file) =>
        fetchFileContent(file, { accessToken, owner: repository.owner, repo: repository.name, ref: commitSha, githubService })
    );

    const contentFailures = fetchResults.filter((r) => r.failure).map((r) => r.failure);
    const manifestFiles = fetchResults
        .filter((r) => !r.failure)
        .map((r) => ({
            path: r.file.path,
            content: r.content,
            language: r.file.language,
            size_bytes: r.file.size,
        }));

    // Task 39: exactly one manifest, carrying every eligible file, is
    // submitted per repository ingestion attempt -- never split into
    // multiple top-level FastAPI requests. Task 30 allows only one
    // in-flight job per repository_id, and a second submission would
    // only ever collide with the first (§Task 38 Part 2).
    const manifest = {
        workspace_id: workspaceId,
        commit_sha: commitSha,
        files: manifestFiles,
    };

    const submissionResult = await fastapiClient.submitIngestionManifest(repositoryId, manifest, { config });

    const submittedJob = submissionResult.success
        ? { fileCount: manifestFiles.length, jobId: submissionResult.jobId, status: submissionResult.status }
        : null;

    const submissionFailures = submissionResult.success
        ? []
        : [
              {
                  fileCount: manifestFiles.length,
                  statusCode: submissionResult.statusCode,
                  errorCode: submissionResult.errorCode,
                  reason: submissionResult.reason,
              },
          ];

    return {
        ...baseResult,
        blocked: false,
        submittedJob,
        failures: [...contentFailures.map((f) => ({ ...f, stage: "content_fetch" })), ...submissionFailures.map((f) => ({ ...f, stage: "fastapi_submission" }))],
    };
}
