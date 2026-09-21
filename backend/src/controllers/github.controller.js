import mongoose from "mongoose";
import path from "path";
import Repository from "../models/repositories.model.js";
import Branch from "../models/branches.model.js";
import Commit from "../models/commits.model.js";
import File from "../models/files.model.js";
import Workspace from "../models/workspaces.model.js";
import Analysis from "../models/analyses.model.js";
import * as githubService from "../services/github.service.js";
import * as emailService from "../services/email.service.js";
import { prepareAndSubmitIngestion } from "../services/ingestionPreparation.service.js";
import { prepareAndSubmitAnalysis, prepareAndSubmitEvolutionAnalysis } from "../services/analysisPreparation.service.js";
import { submitChatMessage, streamChatMessage, submitCommitImpactAnalysis } from "../services/fastapiClient.service.js";
import { submitExplanation } from "../services/fastapiClient.service.js";
import { buildDependencyGraph } from "../services/dependencyAnalyzer.service.js";

// Analysis.analysisType this feature persists under (Task 69) -- reuses
// the existing enum value exactly (no schema change needed): commit
// churn/hotspot/trend analysis is precisely what "evolution" already
// named in this schema, and no other existing value ("code",
// "architecture", "documentation") fits as well.
const ANALYSIS_TYPE = "evolution";

/**
 * Maps a file extension to a programming/markup language.
 * Exported so other consumers (e.g. ingestionPreparation.service.js) reuse
 * this exact classification instead of duplicating the extension map.
 */
export const detectLanguage = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".py": "python",
        ".java": "java",
        ".cpp": "cpp",
        ".c": "c",
        ".cs": "csharp",
        ".go": "go",
        ".rs": "rust",
        ".php": "php",
        ".rb": "ruby",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
        ".json": "json",
        ".md": "markdown",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".xml": "xml",
        ".sql": "sql",
        ".sh": "shell",
    };
    return map[ext] || null;
};

/**
 * Serializes a real `Repository` Mongo document into the identity shape
 * every repository-scoped endpoint returns (Task 71 -- extracted from
 * `makeGetDashboard`, which previously built this same object inline;
 * now shared with the new single-repository lookup below so the two
 * response shapes can never silently drift apart).
 */
function serializeRepositoryIdentity(repository) {
    return {
        id: repository._id,
        name: repository.name,
        owner: repository.owner,
        fullName: repository.fullName,
        description: repository.description,
        defaultBranch: repository.defaultBranch,
        language: repository.language,
        stars: repository.stars,
        forks: repository.forks,
        openIssues: repository.openIssues,
        visibility: repository.visibility,
        htmlUrl: repository.htmlUrl,
        lastFetchedAt: repository.lastFetchedAt,
        workspaceId: repository.workspaceId,
        ingestionStatus: repository.ingestionStatus || "pending",
        ingestionStage: repository.ingestionStage || null,
        chunkCount: repository.chunkCount || 0,
        lastIngestedAt: repository.lastIngestedAt || null,
        ingestionError: repository.ingestionError || null,
        lastIngestedCommitSha: repository.lastIngestedCommitSha || null,
    };
}

/**
 * List all synchronized repositories for the authenticated user
 * GET /api/github/repositories
 */
export const getRepositories = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
        const search = req.query.search?.trim();
        const visibility = req.query.visibility;

        const query = { userId };

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (visibility && ["public", "private"].includes(visibility)) {
            query.visibility = visibility;
        }

        const total = await Repository.countDocuments(query);
        const repositories = await Repository.find(query)
            .sort({ githubPushedAt: -1, updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return res.json({
            success: true,
            count: repositories.length,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
            repositories,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Fetches one real, already-synced repository's identity by its Mongo
 * `_id` (Task 71). This is the single-repository counterpart to
 * `getRepositories`' list -- added so the frontend has a lightweight,
 * canonical way to resolve a `repositoryId` found in the URL (browser
 * refresh, direct link, a fresh tab) back into a real repository name/
 * owner/branch, without depending on React Router `location.state`
 * (which does not survive a refresh) and without paying for the heavier
 * `/dashboard` aggregation just to answer "does this repository exist
 * and do I own it".
 * GET /api/github/repositories/:repositoryId
 */
export const getRepository = async (req, res, next) => {
    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        return res.json({ success: true, repository: serializeRepositoryIdentity(repository) });
    } catch (error) {
        next(error);
    }
};

/**
 * Synchronize all repositories from GitHub for the authenticated user
 * POST /api/github/repositories/sync
 *
 * Accepts an optional `workspaceId` in the request body (Task 43: this
 * is the point in the existing repository lifecycle where
 * `Repository.workspaceId` becomes available -- "GitHub synchronization
 * -> Repository.workspaceId available" in the Task 43 architecture).
 * Omitting it preserves the existing behavior exactly (repositories
 * remain unassociated, `workspaceId: null`) -- this is purely additive,
 * never required, so no existing caller/repository is affected.
 */
export const syncRepositories = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const accessToken = req.user.accessToken;
        const { workspaceId } = req.body || {};

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "No GitHub access token associated with this user account. Please log in again.",
            });
        }

        // Resolve + authorize the target workspace, if one was supplied.
        // Ownership is enforced the same way every other resource in this
        // controller is (compare against req.user._id) -- a user can only
        // sync repositories into a workspace they themselves own.
        let resolvedWorkspaceId = null;
        if (workspaceId !== undefined && workspaceId !== null && workspaceId !== "") {
            if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid workspace ID format.",
                });
            }

            const workspace = await Workspace.findOne({ _id: workspaceId, ownerId: userId });

            if (!workspace) {
                return res.status(404).json({
                    success: false,
                    message: "Workspace not found or access denied.",
                });
            }

            resolvedWorkspaceId = workspace._id;
        }

        // Fetch repositories from GitHub API
        const githubRepos = await githubService.getUserRepositories(accessToken, { perPage: 100 });

        const syncedRepositories = [];
        const now = new Date();

        for (const repo of githubRepos) {
            const mappedRepo = {
                userId,
                // Only included when explicitly supplied -- a resync that
                // doesn't pass workspaceId must never wipe out a
                // previously-assigned one (Mongoose applies a plain
                // update object as a $set per key, so an omitted key is
                // simply left untouched on an existing document).
                ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
                githubRepoId: String(repo.id),
                owner: repo.owner.login,
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description || null,
                htmlUrl: repo.html_url,
                cloneUrl: repo.clone_url,
                visibility: repo.visibility || (repo.private ? "private" : "public"),
                isPrivate: Boolean(repo.private),
                isFork: Boolean(repo.fork),
                isArchived: Boolean(repo.archived),
                defaultBranch: repo.default_branch || "main",
                language: repo.language || null,
                stars: repo.stargazers_count || 0,
                forks: repo.forks_count || 0,
                watchers: repo.watchers_count || 0,
                openIssues: repo.open_issues_count || 0,
                topics: repo.topics || [],
                license: repo.license?.spdx_id || repo.license?.name || null,
                githubCreatedAt: repo.created_at ? new Date(repo.created_at) : null,
                githubUpdatedAt: repo.updated_at ? new Date(repo.updated_at) : null,
                githubPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
                lastFetchedAt: now,
            };

            const saved = await Repository.findOneAndUpdate(
                { userId, githubRepoId: String(repo.id) },
                mappedRepo,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            syncedRepositories.push(saved);
        }

        // Send summary email asynchronously (non-blocking)
        if (req.user.email) {
            emailService.sendRepositorySyncEmail(req.user.email, {
                repositoryCount: syncedRepositories.length,
            }).catch((err) => {
                console.error("[GitHubSync] Sync summary email failed:", err.message);
            });
        }

        return res.json({
            success: true,
            message: `Successfully synchronized ${syncedRepositories.length} repositories from GitHub.`,
            syncedCount: syncedRepositories.length,
            repositories: syncedRepositories,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Fetch and synchronize branches for a given repository
 * GET /api/github/repositories/:repositoryId/branches
 *
 * Wrapped in the same injectable-`deps` factory shape as `makeGetDashboard`
 * (below) -- previously a plain export, which meant it had no seam a test
 * could use to substitute a fake GitHub response, and this file had zero
 * test coverage for GitHub-credential failures on this endpoint as a
 * result. `getBranches` (the real, default-wired export routes actually
 * use) is unchanged in behavior.
 */
export const makeGetBranches = (deps = {}) => async (req, res, next) => {
    const { getRepositoryBranches: getBranchesImpl = githubService.getRepositoryBranches } = deps;
    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        // Verify repository ownership
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Fetch branches from GitHub
        const githubBranches = await getBranchesImpl(
            req.user.accessToken,
            repository.owner,
            repository.name
        );

        const now = new Date();
        const branches = [];

        for (const branch of githubBranches) {
            const mappedBranch = {
                repositoryId: repository._id,
                name: branch.name,
                isDefault: branch.name === repository.defaultBranch,
                isProtected: Boolean(branch.protected),
                latestCommitSha: branch.commit?.sha || null,
                lastFetchedAt: now,
            };

            const savedBranch = await Branch.findOneAndUpdate(
                { repositoryId: repository._id, name: branch.name },
                mappedBranch,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            branches.push(savedBranch);
        }

        return res.json({
            success: true,
            count: branches.length,
            branches,
        });
    } catch (error) {
        next(error);
    }
};

export const getBranches = makeGetBranches();

/**
 * Fetch and synchronize commits for a given repository and branch
 * GET /api/github/repositories/:repositoryId/branches/:branchId/commits
 *
 * Same injectable-`deps` factory shape as `makeGetBranches` above, for the
 * same reason -- no prior test seam existed for this endpoint's GitHub-
 * credential-failure path. `getCommits` (the real, default-wired export
 * routes actually use) is unchanged in behavior.
 */
export const makeGetCommits = (deps = {}) => async (req, res, next) => {
    const {
        getBranchCommits: getBranchCommitsImpl = githubService.getBranchCommits,
        getCommitDetail: getCommitDetailImpl = githubService.getCommitDetail,
    } = deps;
    try {
        const { repositoryId, branchId } = req.params;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 30));

        if (!mongoose.Types.ObjectId.isValid(repositoryId) || !mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID or branch ID format.",
            });
        }

        // Verify repository ownership
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Verify branch belongs to repository
        const branch = await Branch.findOne({
            _id: branchId,
            repositoryId: repository._id,
        });

        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found for this repository.",
            });
        }

        // Fetch commits from GitHub using branch name
        const githubCommits = await getBranchCommitsImpl(
            req.user.accessToken,
            repository.owner,
            repository.name,
            { sha: branch.name, page, perPage: limit }
        );

        // Query existing commits to preserve already-enriched stats
        const shas = githubCommits.map((item) => item.sha);
        const existingCommits = await Commit.find({
            repositoryId: repository._id,
            githubSha: { $in: shas },
        });
        const existingMap = new Map(existingCommits.map((c) => [c.githubSha, c]));

        // Determine which commits in this page need detail enrichment
        const needsEnrichment = [];
        for (const item of githubCommits) {
            const existing = existingMap.get(item.sha);
            if (!item.stats && (!existing || !existing.hasStats)) {
                needsEnrichment.push(item.sha);
            }
        }

        // Enrich missing commits in parallel batches (concurrency: 5)
        const enrichedDetails = new Map();
        if (needsEnrichment.length > 0) {
            const batchSize = 5;
            for (let i = 0; i < needsEnrichment.length; i += batchSize) {
                const chunk = needsEnrichment.slice(i, i + batchSize);
                await Promise.all(
                    chunk.map(async (sha) => {
                        try {
                            const detail = await getCommitDetailImpl(
                                req.user.accessToken,
                                repository.owner,
                                repository.name,
                                sha
                            );
                            if (detail) {
                                const additions = detail.stats?.additions ?? (detail.files ? detail.files.reduce((s, f) => s + (f.additions || 0), 0) : null);
                                const deletions = detail.stats?.deletions ?? (detail.files ? detail.files.reduce((s, f) => s + (f.deletions || 0), 0) : null);
                                const filesChanged = detail.files ? detail.files.map((f) => f.filename).filter(Boolean) : [];
                                enrichedDetails.set(sha, {
                                    additions,
                                    deletions,
                                    changedFilesCount: detail.files?.length ?? filesChanged.length,
                                    filesChanged,
                                    hasStats: additions !== null && deletions !== null,
                                });
                            }
                        } catch (err) {
                            // Non-fatal if single commit detail call fails
                        }
                    })
                );
            }
        }

        for (const item of githubCommits) {
            const existing = existingMap.get(item.sha);
            const detail = enrichedDetails.get(item.sha);

            const mappedCommit = {
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
                committedAt: item.commit?.author?.date
                    ? new Date(item.commit.author.date)
                    : (item.commit?.committer?.date ? new Date(item.commit.committer.date) : new Date()),
            };

            if (item.stats) {
                mappedCommit.additions = item.stats.additions;
                mappedCommit.deletions = item.stats.deletions;
                mappedCommit.hasStats = true;
            } else if (detail) {
                mappedCommit.additions = detail.additions;
                mappedCommit.deletions = detail.deletions;
                mappedCommit.changedFilesCount = detail.changedFilesCount;
                mappedCommit.filesChanged = detail.filesChanged;
                mappedCommit.hasStats = detail.hasStats;
            } else if (existing && existing.hasStats) {
                mappedCommit.additions = existing.additions;
                mappedCommit.deletions = existing.deletions;
                mappedCommit.changedFilesCount = existing.changedFilesCount;
                mappedCommit.filesChanged = existing.filesChanged;
                mappedCommit.hasStats = existing.hasStats;
            }

            if (item.files) {
                mappedCommit.changedFilesCount = item.files.length;
                mappedCommit.filesChanged = item.files.map((f) => f.filename);
            }

            await Commit.findOneAndUpdate(
                { repositoryId: repository._id, githubSha: item.sha },
                mappedCommit,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }

        // Retrieve commits from database
        const total = await Commit.countDocuments({ repositoryId: repository._id, branchId: branch._id });
        const commits = await Commit.find({ repositoryId: repository._id, branchId: branch._id })
            .sort({ committedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return res.json({
            success: true,
            count: commits.length,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
            commits,
        });
    } catch (error) {
        next(error);
    }
};

export const getCommits = makeGetCommits();

/**
 * Fetch and synchronize repository file tree metadata
 * GET /api/github/repositories/:repositoryId/branches/:branchId/files
 */
export const getFiles = async (req, res, next) => {
    try {
        const { repositoryId, branchId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId) || !mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID or branch ID format.",
            });
        }

        // Verify repository ownership
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Verify branch belongs to repository
        const branch = await Branch.findOne({
            _id: branchId,
            repositoryId: repository._id,
        });

        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found for this repository.",
            });
        }

        // Fetch tree from GitHub using branch's latest commit SHA or branch name
        const treeSha = branch.latestCommitSha || branch.name;
        const treeData = await githubService.getRepositoryTree(
            req.user.accessToken,
            repository.owner,
            repository.name,
            treeSha,
            { recursive: true }
        );

        const now = new Date();
        const savedFiles = [];

        if (treeData && Array.isArray(treeData.tree)) {
            for (const item of treeData.tree) {
                const ext = path.extname(item.path);
                const fileName = path.basename(item.path);
                const fileType = item.type === "tree" ? "directory" : "file";
                const language = fileType === "file" ? detectLanguage(item.path) : null;
                const htmlUrl = `https://github.com/${repository.fullName}/${fileType === "file" ? "blob" : "tree"}/${branch.name}/${item.path}`;

                const mappedFile = {
                    repositoryId: repository._id,
                    branchId: branch._id,
                    path: item.path,
                    name: fileName,
                    extension: ext ? ext.replace(".", "") : null,
                    type: fileType,
                    size: item.size || 0,
                    sha: item.sha,
                    htmlUrl,
                    language,
                    lastFetchedAt: now,
                };

                const saved = await File.findOneAndUpdate(
                    { repositoryId: repository._id, branchId: branch._id, path: item.path },
                    mappedFile,
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                savedFiles.push(saved);
            }
        }

        return res.json({
            success: true,
            count: savedFiles.length,
            truncated: Boolean(treeData?.truncated),
            files: savedFiles,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Fetch content of an individual file on demand
 * GET /api/github/repositories/:repositoryId/files/content?path=...&ref=...
 */
export const getFileContent = async (req, res, next) => {
    try {
        const { repositoryId } = req.params;
        const filePath = req.query.path?.trim();
        const ref = req.query.ref || req.query.branch;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        if (!filePath) {
            return res.status(400).json({
                success: false,
                message: "Query parameter 'path' is required to fetch file content.",
            });
        }

        // Verify repository ownership
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Fetch file content from GitHub
        const fileContent = await githubService.getFileContent(
            req.user.accessToken,
            repository.owner,
            repository.name,
            filePath,
            ref || repository.defaultBranch
        );

        return res.json({
            success: true,
            file: fileContent,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Parses a real fetched manifest file's content into a dependency count.
 * Never invents a count for a manifest shape it doesn't recognize -- an
 * unparseable/malformed file yields `null`, not `0` (Task 68 §"do not
 * fabricate", distinguishing "genuinely zero dependencies" from "could not
 * be read").
 */
const parseDependencyCount = (manifestName, content) => {
    if (content == null) return null;
    try {
        if (manifestName === "package.json") {
            const pkg = JSON.parse(content);
            const deps = pkg.dependencies && typeof pkg.dependencies === "object" ? Object.keys(pkg.dependencies) : [];
            const devDeps = pkg.devDependencies && typeof pkg.devDependencies === "object" ? Object.keys(pkg.devDependencies) : [];
            return deps.length + devDeps.length;
        }
        if (manifestName === "requirements.txt") {
            return content
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.startsWith("#")).length;
        }
    } catch {
        return null;
    }
    return null;
};

/**
 * Resolves the branch every repository-level (not branch-scoped-by-URL)
 * endpoint should treat as "the" branch -- preferring already-synced
 * Mongo `Branch` data and syncing from GitHub only once, if nothing is
 * synced yet (Task 68's own "prefer already-synced data" pattern,
 * extracted here in Task 69 so the Dashboard endpoint and the repository
 * analysis endpoint share one implementation instead of two copies that
 * could silently drift apart).
 *
 * @param {object} params
 * @param {{_id: string, owner: string, name: string, defaultBranch: string}} params.repository
 * @param {string} params.accessToken
 * @param {(accessToken: string, owner: string, name: string) => Promise<Array>} params.getRepositoryBranches
 * @returns {Promise<object|null>} the resolved Branch document, or null if none could be resolved
 */
async function resolveOrSyncDefaultBranch({ repository, accessToken, getRepositoryBranches }) {
    let branches = await Branch.find({ repositoryId: repository._id });
    if (branches.length === 0) {
        const githubBranches = await getRepositoryBranches(accessToken, repository.owner, repository.name);
        const now = new Date();
        for (const b of githubBranches) {
            const saved = await Branch.findOneAndUpdate(
                { repositoryId: repository._id, name: b.name },
                {
                    repositoryId: repository._id,
                    name: b.name,
                    isDefault: b.name === repository.defaultBranch,
                    isProtected: Boolean(b.protected),
                    latestCommitSha: b.commit?.sha || null,
                    lastFetchedAt: now,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            branches.push(saved);
        }
    }

    return (
        branches.find((b) => b.isDefault) ||
        branches.find((b) => b.name === repository.defaultBranch) ||
        branches[0] ||
        null
    );
}

/**
 * Real repository/branch/file/commit/language/contributor data, aggregated
 * for the Dashboard (Task 68 -- replaces the frontend's previous fully
 * mock/seeded `commandCenterMockData.buildCommandCenterData`).
 *
 * Ownership-checked identically to every other repository-scoped action in
 * this controller. Prefers already-synced Mongo data (Branch/File/Commit --
 * the same collections `getBranches`/`getFiles`/`getCommits` already
 * populate) and only falls back to a live GitHub sync when nothing has been
 * synced yet, so a repository already explored via Source Control loads
 * this endpoint without redundant GitHub calls. Languages and contributors
 * have no local model to cache in, so those two are always fetched live
 * from GitHub directly (one call each).
 *
 * Every field that cannot be honestly derived from real data --
 * dependencies with no recognized root manifest, an architecture section
 * with no synced files, and Lines of Code always (no line-count data is
 * ever synced anywhere in this codebase, only byte `size`) -- reports
 * `available: false` rather than a fabricated value.
 * GET /api/github/repositories/:repositoryId/dashboard
 */
export const makeGetDashboard = (deps = {}) => async (req, res, next) => {
    const {
        getRepositoryBranches: getBranchesImpl = githubService.getRepositoryBranches,
        getRepositoryTree: getTreeImpl = githubService.getRepositoryTree,
        getBranchCommits: getCommitsImpl = githubService.getBranchCommits,
        getRepositoryLanguages: getLanguagesImpl = githubService.getRepositoryLanguages,
        getRepositoryContributors: getContributorsImpl = githubService.getRepositoryContributors,
        getFileContent: getFileContentImpl = githubService.getFileContent,
    } = deps;

    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const accessToken = req.user.accessToken;

        const branch = await resolveOrSyncDefaultBranch({
            repository,
            accessToken,
            getRepositoryBranches: getBranchesImpl,
        });

        const responseBody = {
            success: true,
            repository: serializeRepositoryIdentity(repository),
            branch: branch ? { id: branch._id, name: branch.name, isDefault: branch.isDefault, latestCommitSha: branch.latestCommitSha } : null,
            files: { available: false, count: 0, fileCount: 0, directoryCount: 0, truncated: false },
            languages: { available: false, breakdown: [] },
            dependencies: { available: false, manifestPath: null, ecosystem: null, count: null },
            contributors: { available: false, total: 0, truncated: false, top: [] },
            activity: { available: false, commits: [] },
            architecture: { available: false, directories: [], rootFileCount: 0 },
            linesOfCode: { available: false },
        };

        if (!branch) {
            // No branch could be resolved at all -- nothing downstream of
            // branch identity can be honestly fetched either.
            return res.json(responseBody);
        }

        // --- Files: prefer already-synced Mongo data; sync once if none exists yet. ---
        let files = await File.find({ repositoryId: repository._id, branchId: branch._id });
        if (files.length === 0) {
            const treeSha = branch.latestCommitSha || branch.name;
            const treeData = await getTreeImpl(accessToken, repository.owner, repository.name, treeSha, { recursive: true });
            const now = new Date();
            if (treeData && Array.isArray(treeData.tree)) {
                for (const item of treeData.tree) {
                    const ext = path.extname(item.path);
                    const fileType = item.type === "tree" ? "directory" : "file";
                    const saved = await File.findOneAndUpdate(
                        { repositoryId: repository._id, branchId: branch._id, path: item.path },
                        {
                            repositoryId: repository._id,
                            branchId: branch._id,
                            path: item.path,
                            name: path.basename(item.path),
                            extension: ext ? ext.replace(".", "") : null,
                            type: fileType,
                            size: item.size || 0,
                            sha: item.sha,
                            htmlUrl: `https://github.com/${repository.fullName}/${fileType === "file" ? "blob" : "tree"}/${branch.name}/${item.path}`,
                            language: fileType === "file" ? detectLanguage(item.path) : null,
                            lastFetchedAt: now,
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                    files.push(saved);
                }
            }
            responseBody.files.truncated = Boolean(treeData?.truncated);
        }

        const realFiles = files.filter((f) => f.type === "file");
        responseBody.files = {
            available: true,
            count: files.length,
            fileCount: realFiles.length,
            directoryCount: files.length - realFiles.length,
            truncated: responseBody.files.truncated,
        };

        // --- Architecture: real top-level directory structure, real file counts. ---
        // Deliberately never infers a dependency/import relationship between
        // directories -- that isn't derivable from paths alone (Task 68 §9).
        const dirCounts = new Map();
        let rootFileCount = 0;
        for (const f of realFiles) {
            const slash = f.path.indexOf("/");
            if (slash === -1) {
                rootFileCount += 1;
            } else {
                const topDir = f.path.slice(0, slash);
                dirCounts.set(topDir, (dirCounts.get(topDir) || 0) + 1);
            }
        }
        const directories = [...dirCounts.entries()]
            .map(([dirPath, fileCount]) => ({ path: dirPath, fileCount }))
            .sort((a, b) => b.fileCount - a.fileCount);
        responseBody.architecture = {
            available: realFiles.length > 0,
            directories,
            rootFileCount,
        };

        // --- Dependencies: only a real, recognized root manifest is ever parsed. ---
        const rootManifest = realFiles.find((f) => f.path === "package.json") ? "package.json"
            : realFiles.find((f) => f.path === "requirements.txt") ? "requirements.txt"
            : null;
        if (rootManifest) {
            try {
                const manifestFile = await getFileContentImpl(accessToken, repository.owner, repository.name, rootManifest, branch.name);
                const count = parseDependencyCount(rootManifest, manifestFile?.content ?? null);
                responseBody.dependencies = {
                    available: count !== null,
                    manifestPath: rootManifest,
                    ecosystem: rootManifest === "package.json" ? "npm" : "pip",
                    count,
                };
            } catch (err) {
                console.error("[Dashboard] Failed to fetch/parse dependency manifest:", err.message);
            }
        }

        // --- Commits/activity: prefer already-synced Mongo data; sync once if none exists yet. ---
        // Sorted/sliced in JS rather than via a chained Mongoose query so
        // this stays a single, plain `.find(...)` call -- easy to stub in
        // tests exactly like every other model lookup in this controller.
        let commits = await Commit.find({ repositoryId: repository._id, branchId: branch._id });
        commits = [...commits].sort((a, b) => new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime()).slice(0, 15);
        if (commits.length === 0) {
            const githubCommits = await getCommitsImpl(accessToken, repository.owner, repository.name, { sha: branch.name, page: 1, perPage: 15 });
            for (const item of githubCommits) {
                const mappedCommit = {
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
                };

                if (item.stats) {
                    mappedCommit.additions = item.stats.additions;
                    mappedCommit.deletions = item.stats.deletions;
                    mappedCommit.hasStats = true;
                }
                if (item.files) {
                    mappedCommit.changedFilesCount = item.files.length;
                    mappedCommit.filesChanged = item.files.map((f) => f.filename);
                }

                const saved = await Commit.findOneAndUpdate(
                    { repositoryId: repository._id, githubSha: item.sha },
                    mappedCommit,
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                commits.push(saved);
            }
            commits.sort((a, b) => new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime());
            commits = commits.slice(0, 15);
        }
        responseBody.activity = {
            available: commits.length > 0,
            commits: commits.map((c) => ({
                sha: c.githubSha,
                message: c.message,
                author: c.author?.name || c.author?.username || "Unknown",
                committedAt: c.committedAt,
                url: c.commitUrl,
            })),
        };

        // --- Languages: always live, always real GitHub byte counts. ---
        try {
            const languageBytes = await getLanguagesImpl(accessToken, repository.owner, repository.name);
            const entries = Object.entries(languageBytes || {});
            const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
            responseBody.languages = {
                available: entries.length > 0,
                breakdown:
                    totalBytes > 0
                        ? entries
                              .map(([name, bytes]) => ({ name, bytes, percent: Math.round((bytes / totalBytes) * 1000) / 10 }))
                              .sort((a, b) => b.bytes - a.bytes)
                        : [],
            };
        } catch (err) {
            console.error("[Dashboard] Failed to fetch repository languages:", err.message);
        }

        // --- Contributors: always live, always real GitHub data. ---
        try {
            const contributors = await getContributorsImpl(accessToken, repository.owner, repository.name);
            const sorted = [...(contributors || [])].sort((a, b) => (b.contributions || 0) - (a.contributions || 0));
            responseBody.contributors = {
                available: sorted.length > 0,
                total: sorted.length,
                truncated: sorted.length >= 100,
                top: sorted.slice(0, 6).map((c) => ({
                    login: c.login,
                    avatarUrl: c.avatar_url,
                    contributions: c.contributions,
                    htmlUrl: c.html_url,
                })),
            };
        } catch (err) {
            console.error("[Dashboard] Failed to fetch repository contributors:", err.message);
        }

        return res.json(responseBody);
    } catch (error) {
        next(error);
    }
};

export const getDashboard = makeGetDashboard();

/**
 * Serializes a persisted `Analysis` document into the shape the frontend
 * consumes -- never exposes Mongo-internal fields (`__v`, `userId`) and
 * flattens `result` (Mixed) into named fields so the frontend never has
 * to know that shape lives inside a generically-typed column.
 */
function serializeAnalysis(analysisDoc) {
    const result = analysisDoc.result || {};
    return {
        id: analysisDoc._id,
        status: analysisDoc.status,
        model: analysisDoc.model,
        startedAt: analysisDoc.startedAt,
        completedAt: analysisDoc.completedAt,
        error: analysisDoc.error,
        generatedAt: result.generatedAt || null,
        analyzedCommitCount: result.analyzedCommitCount ?? null,
        analyzedFileCount: result.analyzedFileCount ?? null,
        hotspots: result.hotspots || [],
        trends: result.trends || null,
        insights: result.insights || [],
    };
}

/**
 * Returns the most recently persisted repository analysis, if any (Task
 * 69) -- a read-only lookup, never itself triggers generation (that is
 * `generateRepositoryAnalysis`'s job, an explicit POST, per the task's own
 * "avoid running a full expensive analysis on every dashboard page load").
 * GET /api/github/repositories/:repositoryId/analysis
 */
export const makeGetRepositoryAnalysis = (deps = {}) => async (req, res, next) => {
    const { getRepositoryBranches: getBranchesImpl = githubService.getRepositoryBranches } = deps;

    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Repository isolation (Task 69 §7): scoped strictly by this
        // repository's own real Mongo _id -- never by analysisType alone,
        // which is shared across every repository's documents.
        const analysis = await Analysis.findOne({
            repositoryId: repository._id,
            analysisType: ANALYSIS_TYPE,
        }).sort({ createdAt: -1 });

        if (!analysis) {
            return res.json({ success: true, analysis: null, stale: false });
        }

        // Staleness: the branch this analysis was generated against may
        // have moved since (new commits synced) -- detected from already-
        // synced Branch.latestCommitSha, never a fabricated "up to date"
        // claim (Task 69 §4).
        let stale = false;
        if (analysis.status === "completed" && analysis.result?.analyzedCommitSha) {
            const branch = await resolveOrSyncDefaultBranch({
                repository,
                accessToken: req.user.accessToken,
                getRepositoryBranches: getBranchesImpl,
            });
            if (branch?.latestCommitSha && branch.latestCommitSha !== analysis.result.analyzedCommitSha) {
                stale = true;
            }
        }

        return res.json({ success: true, analysis: serializeAnalysis(analysis), stale });
    } catch (error) {
        next(error);
    }
};

export const getRepositoryAnalysis = makeGetRepositoryAnalysis();

/**
 * Triggers a real, deterministic repository analysis run (Task 69):
 * collects bounded real evidence (already-synced or freshly-synced
 * commits, plus content for only the most-frequently-changed files),
 * submits it to FastAPI's analysis pipeline, and persists the result.
 * Never triggers ingestion, embeddings, or any ChromaDB write -- this is
 * a completely separate, Mongo-only + GitHub-REST-only + one FastAPI
 * call pipeline (Task 69 §12 scope control).
 * POST /api/github/repositories/:repositoryId/analysis
 *
 * A factory, not a bare handler, for the same reason
 * `makeIngestRepository`/`makeChatWithRepository` are: `prepareAndSubmitAnalysis`
 * is an injectable dependency so tests can override it without
 * monkeypatching a read-only ESM binding.
 */
export const makeGenerateRepositoryAnalysis = (deps = {}) => async (req, res, next) => {
    const {
        prepareAndSubmitAnalysis: prepareImpl = prepareAndSubmitAnalysis,
        getRepositoryBranches: getBranchesImpl = githubService.getRepositoryBranches,
    } = deps;

    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const accessToken = req.user.accessToken;
        const branch = await resolveOrSyncDefaultBranch({
            repository,
            accessToken,
            getRepositoryBranches: getBranchesImpl,
        });

        if (!branch) {
            return res.status(409).json({
                success: false,
                message: "Repository has no synced branch information. Sync branches before requesting analysis.",
            });
        }

        const analysisDoc = await Analysis.create({
            userId: req.user._id,
            repositoryId: repository._id,
            analysisType: ANALYSIS_TYPE,
            status: "processing",
            startedAt: new Date(),
        });

        const prep = await prepareImpl({ repository, branch, accessToken });

        if (prep.blocked) {
            analysisDoc.status = "failed";
            analysisDoc.error = prep.blockedReason;
            analysisDoc.completedAt = new Date();
            await analysisDoc.save();
            return res.status(409).json({ success: false, message: prep.blockedReason });
        }

        if (!prep.result.success) {
            analysisDoc.status = "failed";
            analysisDoc.error = prep.result.reason || "Repository analysis failed.";
            analysisDoc.completedAt = new Date();
            await analysisDoc.save();
            const statusCode =
                prep.result.statusCode && prep.result.statusCode >= 400 && prep.result.statusCode < 600
                    ? prep.result.statusCode
                    : 502;
            return res.status(statusCode).json({ success: false, message: analysisDoc.error });
        }

        analysisDoc.status = "completed";
        analysisDoc.completedAt = new Date();
        analysisDoc.model = "deterministic-evolution-v1";
        analysisDoc.result = {
            analyzedCommitSha: prep.analyzedCommitSha,
            analyzedCommitCount: prep.analyzedCommitCount,
            analyzedFileCount: prep.analyzedFileCount,
            generatedAt: prep.result.generatedAt,
            hotspots: prep.result.hotspots,
            trends: prep.result.trends,
            insights: prep.result.insights,
        };
        await analysisDoc.save();

        return res.json({ success: true, analysis: serializeAnalysis(analysisDoc), stale: false });
    } catch (error) {
        next(error);
    }
};

export const generateRepositoryAnalysis = makeGenerateRepositoryAnalysis();

/**
 * Triggers AI ingestion for a repository via the existing Task 30/36/37/39
 * FastAPI pipeline (Task 44 -- the first and only HTTP entry point that
 * actually calls prepareAndSubmitIngestion; no prior route did).
 * POST /api/github/repositories/:repositoryId/ingest
 *
 * workspace_id is read exclusively from the persisted Repository.workspaceId
 * (Task 43) -- req.body is never consulted for it, even if a caller
 * supplies one, so the repository's own persisted association is always
 * authoritative and can never be overridden by the caller (Task 42/44).
 *
 * A factory, not a bare handler: `prepareAndSubmitIngestion` is a named
 * ES module export, which -- unlike a Mongoose model's static methods --
 * cannot be monkeypatched from a test file (ESM namespace bindings are
 * read-only to importers). Accepting it as an injectable dependency
 * (defaulting to the real implementation) is the same constructor/
 * parameter-injection pattern `prepareAndSubmitIngestion` itself already
 * uses for `githubService`/`fastapiClient` -- not a second ingestion
 * implementation, just one more layer of the same, already-established
 * pattern. `ingestRepository` (exported below, used by the real route)
 * is this factory called with zero overrides.
 */
export const makeIngestRepository = (deps = {}) => async (req, res, next) => {
    const { prepareAndSubmitIngestion: prepareAndSubmitIngestionImpl = prepareAndSubmitIngestion } = deps;

    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        // Verify repository ownership -- identical pattern to every other
        // repository-scoped action in this controller.
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        // Repository.workspaceId (Task 43) is the sole source of
        // workspace_id. If it's still null (an existing repository that
        // predates workspaces, or one never associated with one), ingestion
        // must not proceed -- and it must not invent, default, or derive a
        // value from anything else (Task 42/44).
        if (!repository.workspaceId) {
            return res.status(409).json({
                success: false,
                message:
                    "This repository is not associated with a workspace. Associate it with a workspace before requesting ingestion.",
            });
        }

        // Reuses the same Branch records `getBranches` already syncs --
        // no GitHub fetching is reimplemented here.
        const branch = await Branch.findOne({
            repositoryId: repository._id,
            name: repository.defaultBranch,
        });

        if (!branch) {
            return res.status(400).json({
                success: false,
                message:
                    "Repository has no synced branch information. Sync branches before requesting ingestion.",
            });
        }

        const forceReingest = Boolean(req.body?.force);

        // Check if repository is stuck in processing for > 5 minutes
        const isStuckProcessing =
            repository.ingestionStatus === "processing" &&
            repository.updatedAt &&
            Date.now() - new Date(repository.updatedAt).getTime() > 5 * 60 * 1000;

        // Idempotency Check 1: If repository is currently processing (and not stuck/forced), do not spawn duplicate jobs
        if (!forceReingest && !isStuckProcessing && repository.ingestionStatus === "processing") {
            return res.status(200).json({
                success: true,
                alreadyProcessing: true,
                ingestionStatus: "processing",
                ingestionStage: repository.ingestionStage || "processing",
                message: "Ingestion is already processing for this repository.",
            });
        }

        // Idempotency Check 2: If repository is already completed for the current commit SHA, reuse existing ingestion
        if (
            !forceReingest &&
            repository.ingestionStatus === "completed" &&
            branch.latestCommitSha &&
            repository.lastIngestedCommitSha === branch.latestCommitSha
        ) {
            return res.status(200).json({
                success: true,
                alreadyCompleted: true,
                ingestionStatus: "completed",
                chunkCount: repository.chunkCount || 0,
                lastIngestedAt: repository.lastIngestedAt,
                lastIngestedCommitSha: repository.lastIngestedCommitSha,
                message: `Repository is already fully ingested for commit ${branch.latestCommitSha.slice(0, 7)}.`,
            });
        }

        const result = await prepareAndSubmitIngestionImpl({
            repository,
            branch,
            accessToken: req.user.accessToken,
            workspaceId: String(repository.workspaceId),
        });

        if (result.blocked) {
            // Defense-in-depth only -- unreachable given the workspaceId
            // check above, but prepareAndSubmitIngestion's own Task 37
            // STOP CONDITION is left fully intact, not removed.
            return res.status(409).json({ success: false, ...result });
        }

        if (result.submittedJob) {
            repository.ingestionStatus = "processing";
            repository.ingestionStage = "queued";
            repository.lastIngestedCommitSha = branch.latestCommitSha;
            repository.ingestionError = null;
            if (typeof repository.save === "function") {
                await repository.save();
            }

            return res.status(202).json({
                success: true,
                ...result,
                ingestionStatus: "processing",
                lastIngestedCommitSha: branch.latestCommitSha,
            });
        }

        if (result.filesEligible === 0) {
            repository.ingestionStatus = "completed";
            repository.ingestionStage = "completed";
            repository.lastIngestedCommitSha = branch.latestCommitSha;
            repository.lastIngestedAt = new Date();
            if (typeof repository.save === "function") {
                await repository.save();
            }

            return res.status(200).json({
                success: true,
                ...result,
                ingestionStatus: "completed",
            });
        }

        // Eligible files existed but the FastAPI submission itself failed
        // (network/4xx/5xx, recorded in result.failures) -- Express acted
        // correctly as a gateway; the upstream call did not succeed.
        return res.status(502).json({ success: false, ...result });
    } catch (error) {
        next(error);
    }
};

export const ingestRepository = makeIngestRepository();

/**
 * Proxies one chat message to the real Repository Chat pipeline (Task 54/55
 * -- retrieve -> rerank -> build context -> Nemotron 3 Ultra -> cite,
 * already live-verified end to end). POST /api/github/repositories/:repositoryId/chat
 *
 * Ownership-checked identically to every other repository-scoped action in
 * this controller. `conversation_id` is supplied by the caller (the
 * frontend generates one per drawer session) and passed through unchanged
 * -- this proxy itself remains stateless (no persistence on the Express/
 * Mongo side), but as of Task 65 FastAPI persists the actual conversation
 * history server-side (Redis-backed, keyed by repository_id +
 * conversation_id), so the same id reused across messages now carries
 * real multi-turn context end to end.
 *
 * A factory, not a bare handler, for the same reason `makeIngestRepository`
 * is one: `submitChatMessage` is an injectable dependency so tests can
 * override it without monkeypatching a read-only ESM binding.
 */
export const makeChatWithRepository = (deps = {}) => async (req, res, next) => {
    const { submitChatMessage: submitChatMessageImpl = submitChatMessage } = deps;

    try {
        const { repositoryId } = req.params;
        const { message, conversation_id: conversationId } = req.body ?? {};

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        if (typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "A non-empty message is required.",
            });
        }

        if (typeof conversationId !== "string" || conversationId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "A non-empty conversation_id is required.",
            });
        }

        // Verify repository ownership -- identical pattern to every other
        // repository-scoped action in this controller.
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const result = await submitChatMessageImpl(repositoryId, {
            message,
            conversation_id: conversationId,
        });

        if (!result.success) {
            // Forward FastAPI's real status/reason honestly rather than
            // collapsing every failure into a generic 500 -- the frontend
            // shows this as an actual error, never a fabricated answer.
            const statusCode =
                result.statusCode && result.statusCode >= 400 && result.statusCode < 600
                    ? result.statusCode
                    : 502;
            return res.status(statusCode).json({
                success: false,
                message: result.reason || "The AI service could not answer this question.",
            });
        }

        return res.json({
            success: true,
            conversationId: result.conversationId,
            answer: result.answer,
            citations: result.citations,
            tokenUsage: result.tokenUsage,
        });
    } catch (error) {
        next(error);
    }
};

export const chatWithRepository = makeChatWithRepository();

/**
 * POST /api/github/repositories/:repositoryId/chat/stream
 * Streams AI Copilot repository chat tokens from FastAPI via Server-Sent Events (SSE).
 */
export const streamChatWithRepository = async (req, res, next) => {
    try {
        const { repositoryId } = req.params;
        const { message, conversation_id: conversationId } = req.body ?? {};

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        if (typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "A non-empty message is required.",
            });
        }

        if (typeof conversationId !== "string" || conversationId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "A non-empty conversation_id is required.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        await streamChatMessage(repositoryId, { message, conversation_id: conversationId }, res);
    } catch (error) {
        next(error);
    }
};

// ---------------------------------------------------------------------------
// Task 93: AI Code Explanation + Architecture Summary
// ---------------------------------------------------------------------------

/**
 * POST /api/github/repositories/:repositoryId/explain
 *
 * Proxies to RepositoryExplainService (FastAPI, Task 93) which runs the
 * same RAG/LLM pipeline as chat but with task-scoped prompt templates:
 *  - task_type='code_explanation' explains a specific file (file_path required)
 *  - task_type='architecture_summary' summarises the whole repository
 *
 * Validation mirrors chatWithRepository: repository ownership first, then
 * body shape, then FastAPI call.  File-path safety (no '../' traversal) is
 * checked here so a malformed path never reaches the AI service.
 */
export const explainRepository = async (req, res, next) => {
    try {
        const { repositoryId } = req.params;
        const { task_type: taskType, file_path: filePath } = req.body ?? {};

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const allowedTaskTypes = ["code_explanation", "architecture_summary"];
        if (!allowedTaskTypes.includes(taskType)) {
            return res.status(400).json({
                success: false,
                message: `task_type must be one of: ${allowedTaskTypes.join(", ")}.`,
            });
        }

        if (taskType === "code_explanation") {
            if (typeof filePath !== "string" || filePath.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "file_path is required for task_type 'code_explanation'.",
                });
            }
            // Path-traversal guard -- file_path must be repository-relative.
            const normalised = filePath.replace(/\\/g, "/");
            if (normalised.startsWith("/") || normalised.includes("..")) {
                return res.status(400).json({
                    success: false,
                    message: "file_path must be a relative path with no '..' components.",
                });
            }
        }

        // Verify repository ownership -- same pattern as every other repository-
        // scoped action in this controller.
        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const fastapiPayload = { task_type: taskType };
        if (filePath) fastapiPayload.file_path = filePath;

        const result = await submitExplanation(repositoryId, fastapiPayload);

        if (!result.success) {
            const statusCode =
                result.statusCode && result.statusCode >= 400 && result.statusCode < 600
                    ? result.statusCode
                    : 502;
            return res.status(statusCode).json({
                success: false,
                message: result.reason || "The AI service could not generate an explanation.",
            });
        }

        return res.json({
            success: true,
            taskType: result.taskType,
            filePath: result.filePath,
            answer: result.answer,
            citations: result.citations,
        });
    } catch (error) {
        next(error);
    }
};

// In-memory dependency graph cache
const _depGraphCache = new Map();

/**
 * Real directed Dependency Graph endpoint for Architecture Page (Task: Dependency Graph Analysis).
 * Fetches repository branch files, parses internal source imports/requires, resolves relative paths,
 * detects circular dependencies, and builds graph model.
 * GET /api/github/repositories/:repositoryId/branches/:branchId/dependencies
 */
export const makeGetDependencyGraph = (deps = {}) => async (req, res, next) => {
    const {
        getFileContentImpl = githubService.getFileContent,
        getTreeImpl = githubService.getRepositoryTree,
    } = deps;

    try {
        const { repositoryId, branchId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId) || !mongoose.Types.ObjectId.isValid(branchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository or branch ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const branch = await Branch.findOne({
            _id: branchId,
            repositoryId: repository._id,
        });

        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found for this repository.",
            });
        }

        const cacheKey = `${repository._id}:${branch._id}:${branch.latestCommitSha || branch.name}`;
        if (req.query.forceRefresh !== "true" && _depGraphCache.has(cacheKey)) {
            return res.json({
                success: true,
                cached: true,
                ..._depGraphCache.get(cacheKey),
            });
        }

        // Fetch all files in branch
        let files = await File.find({ repositoryId: repository._id, branchId: branch._id });
        if (files.length === 0) {
            const treeSha = branch.latestCommitSha || branch.name;
            const treeData = await getTreeImpl(req.user.accessToken, repository.owner, repository.name, treeSha, { recursive: true });
            if (treeData && Array.isArray(treeData.tree)) {
                const now = new Date();
                for (const item of treeData.tree) {
                    const ext = path.extname(item.path);
                    const fileType = item.type === "tree" ? "directory" : "file";
                    const saved = await File.findOneAndUpdate(
                        { repositoryId: repository._id, branchId: branch._id, path: item.path },
                        {
                            repositoryId: repository._id,
                            branchId: branch._id,
                            path: item.path,
                            name: path.basename(item.path),
                            extension: ext ? ext.replace(".", "") : null,
                            type: fileType,
                            size: item.size || 0,
                            sha: item.sha,
                            language: fileType === "file" ? detectLanguage(item.path) : null,
                            lastFetchedAt: now,
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                    files.push(saved);
                }
            }
        }

        const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".css", ".json"]);
        const ignoredDirs = ["node_modules/", ".git/", "dist/", "build/", ".venv/", "venv/"];

        const codeFiles = files.filter((f) => {
            if (f.type !== "file") return false;
            if (ignoredDirs.some((d) => f.path.startsWith(d))) return false;
            const ext = path.extname(f.path).toLowerCase();
            return codeExtensions.has(ext);
        });

        const filesToParse = codeFiles.slice(0, 150);
        const fileContents = [];

        const batchSize = 10;
        for (let i = 0; i < filesToParse.length; i += batchSize) {
            const batch = filesToParse.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(async (f) => {
                    try {
                        const contentObj = await getFileContentImpl(
                            req.user.accessToken,
                            repository.owner,
                            repository.name,
                            f.path,
                            branch.latestCommitSha || branch.name
                        );
                        return { path: f.path, language: f.language, content: contentObj?.content || "" };
                    } catch (err) {
                        return { path: f.path, language: f.language, content: "" };
                    }
                })
            );
            results.forEach((r) => {
                if (r.content) fileContents.push(r);
            });
        }

        const graphResult = buildDependencyGraph(fileContents, files);
        _depGraphCache.set(cacheKey, graphResult);

        return res.json({
            success: true,
            cached: false,
            ...graphResult,
        });
    } catch (error) {
        next(error);
    }
};

export const getDependencyGraph = makeGetDependencyGraph();

/**
 * Evaluates architectural change risk score, breaking API modifications, and commit impact (Task #4).
 * POST /api/github/repositories/:repositoryId/commits/:commitSha/impact
 */
export const makeAnalyzeCommitImpact = (deps = {}) => async (req, res, next) => {
    const { submitCommitImpactAnalysis: submitImpactImpl = submitCommitImpactAnalysis } = deps;

    try {
        const { repositoryId, commitSha } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const commitDoc = await Commit.findOne({
            repositoryId: repository._id,
            sha: commitSha,
        });

        const commitPayload = commitDoc
            ? {
                  commit_sha: commitDoc.sha,
                  message: commitDoc.message || "",
                  files_changed: commitDoc.filesChanged || [],
                  author_name: commitDoc.authorName,
                  author_email: commitDoc.authorEmail,
                  committed_at: commitDoc.committedAt,
              }
            : {
                  commit_sha: commitSha,
                  message: req.body.message || "Commit impact analysis",
                  files_changed: req.body.filesChanged || [],
              };

        const result = await submitImpactImpl(String(repository._id), {
            commit: commitPayload,
            files: req.body.files || [],
        });

        if (!result.success) {
            return res.status(result.statusCode || 502).json({
                success: false,
                errorCode: result.errorCode || "FASTAPI_ERROR",
                message: result.reason || "FastAPI commit impact analysis failed",
            });
        }

        return res.json(result);
    } catch (error) {
        next(error);
    }
};

export const analyzeCommitImpact = makeAnalyzeCommitImpact();

/**
 * Software Evolution & Code Churn Analytics Controller (Task #9).
 * POST /api/github/repositories/:repositoryId/evolution
 */
export const makeGenerateEvolutionAnalysis = (deps = {}) => async (req, res, next) => {
    const { prepareAndSubmit = prepareAndSubmitEvolutionAnalysis } = deps;

    try {
        const { repositoryId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid repository ID format.",
            });
        }

        const repository = await Repository.findOne({
            _id: repositoryId,
            userId: req.user._id,
        });

        if (!repository) {
            return res.status(404).json({
                success: false,
                message: "Repository not found or access denied.",
            });
        }

        const branch = await resolveOrSyncDefaultBranch({
            repository,
            accessToken: req.user.accessToken,
            getRepositoryBranches: deps.getRepositoryBranches || githubService.getRepositoryBranches,
        });

        if (!branch) {
            return res.status(409).json({
                success: false,
                errorCode: "NO_RESOLVABLE_BRANCH",
                message: "No default or active branch could be resolved for this repository.",
            });
        }

        const prepResult = await prepareAndSubmit({
            repository,
            branch,
            accessToken: req.user.accessToken,
            correlationId: req.correlationId,
        });

        if (prepResult.blocked) {
            return res.status(422).json({
                success: false,
                errorCode: "EVOLUTION_ANALYSIS_BLOCKED",
                message: prepResult.blockedReason,
            });
        }

        if (!prepResult.result?.success) {
            return res.status(prepResult.result?.statusCode || 502).json({
                success: false,
                errorCode: prepResult.result?.errorCode || "FASTAPI_ERROR",
                message: prepResult.result?.reason || "FastAPI software evolution analysis failed",
            });
        }

        return res.json({
            success: true,
            repositoryId: String(repository._id),
            analyzedCommitSha: prepResult.analyzedCommitSha,
            analyzedCommitCount: prepResult.analyzedCommitCount,
            analyzedFileCount: prepResult.analyzedFileCount,
            ...prepResult.result,
        });
    } catch (error) {
        next(error);
    }
};

export const generateEvolutionAnalysis = makeGenerateEvolutionAnalysis();



