import express from "express";
import {
    redirectToGithub,
    githubCallback,
    getMe,
    logout,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public OAuth routes
router.get("/github", redirectToGithub);
router.get("/github/callback", githubCallback);

// Protected routes
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);

export default router;
