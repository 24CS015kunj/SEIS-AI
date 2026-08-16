import express from "express";
import {
    getRepositories,
    syncRepositories,
    getBranches,
    getCommits,
    getFiles,
    getFileContent,
} from "../controllers/github.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// All GitHub data routes are protected with SEIS-AI JWT
router.use(protect);

// Repositories
router.get("/repositories", getRepositories);
router.post("/repositories/sync", syncRepositories);

// Specific file content within a repository
router.get("/repositories/:repositoryId/files/content", getFileContent);

// Branches
router.get("/repositories/:repositoryId/branches", getBranches);

// Commits within a branch
router.get("/repositories/:repositoryId/branches/:branchId/commits", getCommits);

// File tree within a branch
router.get("/repositories/:repositoryId/branches/:branchId/files", getFiles);

export default router;
