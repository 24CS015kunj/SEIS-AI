import mongoose from "mongoose";
import path from "path";
import Repository from "../models/repositories.model.js";
import Branch from "../models/branches.model.js";
import Commit from "../models/commits.model.js";
import File from "../models/files.model.js";
import * as githubService from "../services/github.service.js";
import * as emailService from "../services/email.service.js";

/**
 * Maps a file extension to a programming/markup language
 */
const detectLanguage = (filePath) => {
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
 * Synchronize all repositories from GitHub for the authenticated user
 * POST /api/github/repositories/sync
 */
export const syncRepositories = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const accessToken = req.user.accessToken;

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "No GitHub access token associated with this user account. Please log in again.",
            });
        }

        // Fetch repositories from GitHub API
        const githubRepos = await githubService.getUserRepositories(accessToken, { perPage: 100 });

        const syncedRepositories = [];
        const now = new Date();

        for (const repo of githubRepos) {
            const mappedRepo = {
                userId,
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
 */
export const getBranches = async (req, res, next) => {
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
        const githubBranches = await githubService.getRepositoryBranches(
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

/**
 * Fetch and synchronize commits for a given repository and branch
 * GET /api/github/repositories/:repositoryId/branches/:branchId/commits
 */
export const getCommits = async (req, res, next) => {
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
        const githubCommits = await githubService.getBranchCommits(
            req.user.accessToken,
            repository.owner,
            repository.name,
            { sha: branch.name, page, perPage: limit }
        );

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
                committedAt: item.commit?.author?.date
                    ? new Date(item.commit.author.date)
                    : (item.commit?.committer?.date ? new Date(item.commit.committer.date) : new Date()),
                additions: item.stats?.additions || 0,
                deletions: item.stats?.deletions || 0,
                changedFilesCount: item.files?.length || 0,
                filesChanged: item.files ? item.files.map((f) => f.filename) : [],
            };

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
