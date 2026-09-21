/**
 * Repository analysis evidence preparation (Task 69).
 *
 * Same architectural role for the analysis pipeline that
 * `ingestionPreparation.service.js` already plays for ingestion: builds a
 * real, bounded evidence payload from already-synced Mongo data (falling
 * back to a live GitHub sync only when nothing has been synced yet, same
 * "prefer already-synced data" pattern `github.controller.js`'s own
 * `makeGetDashboard` established in Task 68) and submits it to FastAPI's
 * deterministic repository-analysis pipeline via
 * `fastapiClient.service.js`.
 *
 * File-content scope is deliberately narrow: only the files that actually
 * appear in the analyzed commits' `filesChanged` lists are ever fetched
 * (never the whole repository tree -- that is exactly the LOC-computation
 * cost Task 68 explicitly declined to pay), capped to the
 * `MAX_ANALYZED_FILES` most-frequently-changed distinct paths so a
 * repository with a long, wide-touching history still bounds GitHub API
 * calls the same way `ingestionPreparation.service.js` already bounds its
 * own concurrency.
 */

import Commit from "../models/commits.model.js";
import File from "../models/files.model.js";
import * as githubServiceReal from "./github.service.js";
import * as fastapiClientReal from "./fastapiClient.service.js";
import { getFastapiConfig } from "../config/fastapi.config.js";
import { GITHUB_INLINE_CONTENT_LIMIT_BYTES } from "./ingestionPreparation.service.js";

const DEFAULT_FETCH_CONCURRENCY = 5;
// GitHub's own commits-per-page maximum (Task 69 §"avoid unnecessary
// infrastructure" -- no unbounded history fetch, just the largest single
// page already used elsewhere in this codebase, e.g. getCommits).
const MAX_ANALYZED_COMMITS = 100;
// Bounds how many distinct files' content this evidence collection will
// ever fetch from GitHub for one analysis run -- not every file the
// analyzed commits touched, only the most frequently modified ones (the
// ones ChurnCalculator's own formula weighs most heavily anyway).
const MAX_ANALYZED_FILES = 15;
// Bounds how many commits get a real per-commit detail fetch to learn
// their actually-changed files (see `enrichCommitsWithFileChanges`'s own
// docstring for why this is needed at all) -- the most recent N, not all
// MAX_ANALYZED_COMMITS, to keep one analysis request from costing up to
// 100 sequential-ish GitHub calls.
const MAX_COMMIT_DETAIL_ENRICHMENTS = 30;

/** Runs `fn` over `items` with at most `limit` in flight at once (same
 * bounded-concurrency helper `ingestionPreparation.service.js` already
 * uses for its own content fetches). */
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

function mapCommitForAnalysis(commitDoc) {
    return {
        commit_sha: commitDoc.githubSha,
        message: commitDoc.message || "",
        files_changed: commitDoc.filesChanged || [],
        author_name: commitDoc.author?.name || commitDoc.author?.username || null,
        author_email: commitDoc.author?.email || null,
        committed_at: commitDoc.committedAt ? new Date(commitDoc.committedAt).toISOString() : null,
    };
}

/**
 * Ensures at least one page of real commit history exists for
 * `repositoryId`/`branchId`, syncing from GitHub if nothing is synced yet
 * -- same fallback pattern `makeGetDashboard` (Task 68) already
 * established, reused here rather than duplicated with different
 * behavior.
 */
async function ensureCommitsSynced({ repository, branch, accessToken, githubService }) {
    let commits = await Commit.find({ repositoryId: repository._id, branchId: branch._id });
    if (commits.length > 0) {
        return commits;
    }

    const githubCommits = await githubService.getBranchCommits(
        accessToken,
        repository.owner,
        repository.name,
        { sha: branch.name, page: 1, perPage: MAX_ANALYZED_COMMITS }
    );
    for (const item of githubCommits) {
        const saved = await Commit.findOneAndUpdate(
            { repositoryId: repository._id, githubSha: item.sha },
            {
                repositoryId: repository._id,
                branchId: branch._id,
                githubSha: item.sha,
                message: item.commit?.message || "No commit message",
                author: {
                    githubId: item.author?.id ? String(item.author.id) : null,
                    username: item.author?.login || item.commit?.author?.name || null,
                    name: item.commit?.author?.name || null,
                    email: item.commit?.author?.email || null,
                },
                committer: {
                    githubId: item.committer?.id ? String(item.committer.id) : null,
                    username: item.committer?.login || item.commit?.committer?.name || null,
                    name: item.commit?.committer?.name || null,
                    email: item.commit?.committer?.email || null,
                },
                commitUrl: item.html_url,
                committedAt: item.commit?.author?.date ? new Date(item.commit.author.date) : new Date(),
                additions: item.stats?.additions || 0,
                deletions: item.stats?.deletions || 0,
                changedFilesCount: item.files?.length || 0,
                filesChanged: item.files ? item.files.map((f) => f.filename) : [],
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );
        commits.push(saved);
    }
    return commits;
}

async function fetchOneCommitDetail(commit, { accessToken, owner, repo, githubService }) {
    try {
        const detail = await githubService.getCommitDetail(accessToken, owner, repo, commit.githubSha);
        return { commit, files: Array.isArray(detail?.files) ? detail.files : null, failure: null };
    } catch (error) {
        return { commit, files: null, failure: { sha: commit.githubSha, reason: error.message } };
    }
}

/**
 * GitHub's list-commits API (`getBranchCommits`, used by
 * `ensureCommitsSynced`/the existing `getCommits` endpoint) never
 * includes each commit's changed-file list -- that only comes back from
 * the single-commit detail endpoint (`getCommitDetail`, already existing
 * in `github.service.js` but never called by any commit-sync path in
 * this codebase before this task). Confirmed live against the real
 * Mazesolver repository during Task 69's own verification: every commit
 * synced via the list endpoint has `filesChanged: []`, which would make
 * `CommitAnalyzer`/`ChurnCalculator` see zero candidates for every
 * analysis, regardless of how much real churn actually happened --
 * silently defeating the whole point of this feature. Rather than paper
 * over that with fabricated file lists, this enriches the most recent
 * `MAX_COMMIT_DETAIL_ENRICHMENTS` already-empty commits with one real
 * detail fetch each, and persists the result back onto the `Commit`
 * document (so a later analysis run, or Source Control's own
 * CommitDetailDrawer, benefits from the same real data without
 * re-fetching it).
 */
async function enrichCommitsWithFileChanges(commits, { repository, accessToken, githubService, fetchConcurrency }) {
    const needsEnrichment = commits
        .filter((c) => !c.filesChanged || c.filesChanged.length === 0)
        .slice(0, MAX_COMMIT_DETAIL_ENRICHMENTS);
    if (needsEnrichment.length === 0) {
        return commits;
    }

    const detailResults = await mapWithConcurrency(needsEnrichment, fetchConcurrency, (commit) =>
        fetchOneCommitDetail(commit, { accessToken, owner: repository.owner, repo: repository.name, githubService })
    );

    const enrichedByHash = new Map();
    for (const { commit, files } of detailResults) {
        if (!files) continue;
        const filesChanged = files.map((f) => f.filename).filter(Boolean);
        const additions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
        const deletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
        enrichedByHash.set(commit.githubSha, { filesChanged, additions, deletions });

        // Best-effort persistence -- a failure here must never fail the
        // analysis itself (the in-memory enrichment below already has
        // what this run needs); it only means a future run repeats this
        // one fetch instead of reading it back from Mongo.
        Commit.findOneAndUpdate(
            { repositoryId: repository._id, githubSha: commit.githubSha },
            { filesChanged, changedFilesCount: filesChanged.length, additions, deletions }
        ).catch(() => {});
    }

    return commits.map((c) => {
        const enrichment = enrichedByHash.get(c.githubSha);
        return enrichment ? { ...c.toObject?.() ?? c, ...enrichment } : c;
    });
}

/** Ranks distinct file paths touched by `commits` by how often they
 * appear, most-frequent first -- the same signal `ChurnCalculator`'s own
 * formula weighs, used here only to decide which files are worth the
 * cost of a real content fetch. */
function rankFilesByModificationFrequency(commits) {
    const counts = new Map();
    for (const commit of commits) {
        for (const path of commit.filesChanged || []) {
            counts.set(path, (counts.get(path) || 0) + 1);
        }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path);
}

async function fetchOneFileContent(path, { accessToken, owner, repo, ref, githubService }) {
    try {
        const result = await githubService.getFileContent(accessToken, owner, repo, path, ref);
        return { path, content: result?.content ?? null, failure: null };
    } catch (error) {
        return { path, content: null, failure: { path, reason: error.message } };
    }
}

/**
 * Collects real, bounded evidence and submits it to FastAPI's
 * deterministic repository analysis pipeline.
 *
 * @param {object} params
 * @param {{_id: string, owner: string, name: string}} params.repository
 * @param {{_id: string, name: string, latestCommitSha: string|null}} params.branch
 * @param {string} params.accessToken
 * @param {object} [params.githubService] - injectable (tests only)
 * @param {object} [params.fastapiClient] - injectable (tests only)
 * @param {object} [params.config] - injectable (tests only)
 * @param {number} [params.fetchConcurrency]
 * @returns {Promise<
 *   {blocked: true, blockedReason: string} |
 *   {blocked: false, analyzedCommitSha: string, analyzedCommitCount: number, analyzedFileCount: number, contentFetchFailures: object[], result: object}
 * >}
 */
export async function prepareAndSubmitAnalysis({
    repository,
    branch,
    accessToken,
    githubService = githubServiceReal,
    fastapiClient = fastapiClientReal,
    config = getFastapiConfig(),
    fetchConcurrency = DEFAULT_FETCH_CONCURRENCY,
}) {
    if (!branch.latestCommitSha) {
        return {
            blocked: true,
            blockedReason: `Branch '${branch.name}' has no known commit SHA yet -- sync branches before requesting analysis.`,
        };
    }

    const commitDocs = await ensureCommitsSynced({ repository, branch, accessToken, githubService });
    if (commitDocs.length === 0) {
        return {
            blocked: true,
            blockedReason: "No commit history is available to analyze yet.",
        };
    }

    const sortedCommits = [...commitDocs]
        .sort((a, b) => new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime())
        .slice(0, MAX_ANALYZED_COMMITS);

    const analyzedCommits = await enrichCommitsWithFileChanges(sortedCommits, {
        repository,
        accessToken,
        githubService,
        fetchConcurrency,
    });

    const rankedPaths = rankFilesByModificationFrequency(analyzedCommits).slice(0, MAX_ANALYZED_FILES);

    // Only fetch content for files that still genuinely exist, as real
    // files (not directories), in the current synced tree -- a path a
    // past commit touched but that no longer exists cannot be honestly
    // analyzed for its current size/content (Task 69 §8.13).
    const currentFiles = rankedPaths.length
        ? await File.find({ repositoryId: repository._id, branchId: branch._id, path: { $in: rankedPaths }, type: "file" })
        : [];
    const currentFileByPath = new Map(currentFiles.map((f) => [f.path, f]));
    const eligiblePaths = rankedPaths.filter((path) => {
        const file = currentFileByPath.get(path);
        return Boolean(file) && file.size <= GITHUB_INLINE_CONTENT_LIMIT_BYTES;
    });

    const fetchResults = await mapWithConcurrency(eligiblePaths, fetchConcurrency, (path) =>
        fetchOneFileContent(path, {
            accessToken,
            owner: repository.owner,
            repo: repository.name,
            ref: branch.name,
            githubService,
        })
    );

    const contentFetchFailures = fetchResults.filter((r) => r.failure).map((r) => r.failure);
    const files = fetchResults
        .filter((r) => r.content != null)
        .map((r) => ({
            file_path: r.path,
            content: r.content,
            language: currentFileByPath.get(r.path)?.language || null,
        }));

    const payload = {
        analyzed_commit_sha: branch.latestCommitSha,
        commits: analyzedCommits.map(mapCommitForAnalysis),
        files,
    };

    const result = await fastapiClient.submitRepositoryAnalysis(String(repository._id), payload, { config });

    return {
        blocked: false,
        analyzedCommitSha: branch.latestCommitSha,
        analyzedCommitCount: analyzedCommits.length,
        analyzedFileCount: files.length,
        contentFetchFailures,
        result,
    };
}
