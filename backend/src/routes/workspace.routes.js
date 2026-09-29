import express from "express";
import { createWorkspace, getWorkspaces, setDefaultRepository } from "../controllers/workspace.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// All workspace routes require an authenticated user -- the owner of a
// created workspace is always taken from this authenticated identity,
// never from the request body.
router.use(protect);

router.post("/", createWorkspace);
router.get("/", getWorkspaces);
router.patch("/:workspaceId/default-repository", setDefaultRepository);

export default router;
