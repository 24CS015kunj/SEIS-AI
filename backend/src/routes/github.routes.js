import express from "express";
import {
    getRepositories,
    getRepository,
    syncRepositories,
    getBranches,
    getCommits,
    getFiles,
    getFileContent,
    getDashboard,
    getRepositoryAnalysis,
    generateRepositoryAnalysis,
    ingestRepository,
    chatWithRepository,
    streamChatWithRepository,
    explainRepository,
    getDependencyGraph,
    analyzeCommitImpact,
    generateEvolutionAnalysis,
} from "../controllers/github.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { apiRateLimiter, aiHeavyRateLimiter } from "../middleware/rateLimiter.middleware.js";

const router = express.Router();

// All GitHub data routes are protected with SEIS-AI JWT & general rate limiter
router.use(protect);
router.use(apiRateLimiter);

// Repositories
router.get("/repositories", getRepositories);
router.post("/repositories/sync", syncRepositories);

// Single repository identity lookup (Task 71) -- resolves a `repositoryId`
// found in the URL (refresh/direct link) back into a real name/owner,
// without depending on React Router `location.state`.
router.get("/repositories/:repositoryId", getRepository);

// Specific file content within a repository
router.get("/repositories/:repositoryId/files/content", getFileContent);

// Branches
router.get("/repositories/:repositoryId/branches", getBranches);

// Commits within a branch
router.get("/repositories/:repositoryId/branches/:branchId/commits", getCommits);

// Commit impact analysis (Task #4)
router.post("/repositories/:repositoryId/commits/:commitSha/impact", aiHeavyRateLimiter, analyzeCommitImpact);

// File tree within a branch
router.get("/repositories/:repositoryId/branches/:branchId/files", getFiles);

// Real directed dependency graph analysis
router.get("/repositories/:repositoryId/branches/:branchId/dependencies", getDependencyGraph);

// Aggregated real repository data for the Dashboard (Task 68)
router.get("/repositories/:repositoryId/dashboard", getDashboard);

// Real, deterministic repository analysis (Task 69) -- GET reads the
// latest persisted result (or null); POST triggers a new run.
router.get("/repositories/:repositoryId/analysis", getRepositoryAnalysis);
router.post("/repositories/:repositoryId/analysis", aiHeavyRateLimiter, generateRepositoryAnalysis);

// Software Evolution & Code Churn Analytics (Task #9)
router.post("/repositories/:repositoryId/evolution", aiHeavyRateLimiter, generateEvolutionAnalysis);

// AI ingestion (Task 44) -- workspace_id is always sourced from the
// repository's own persisted workspaceId, never from the request body.
router.post("/repositories/:repositoryId/ingest", aiHeavyRateLimiter, ingestRepository);

// AI Copilot chat (Task 59) -- proxies to the real, live-verified FastAPI
// repository chat pipeline (Task 54/55).
router.post("/repositories/:repositoryId/chat", aiHeavyRateLimiter, chatWithRepository);
router.post("/repositories/:repositoryId/chat/stream", aiHeavyRateLimiter, streamChatWithRepository);

// AI Code Explanation + Architecture Summary (Task 93) -- proxies to
// RepositoryExplainService (FastAPI, CODE_EXPLANATION / ARCHITECTURE_SUMMARY).
router.post("/repositories/:repositoryId/explain", aiHeavyRateLimiter, explainRepository);

export default router;
