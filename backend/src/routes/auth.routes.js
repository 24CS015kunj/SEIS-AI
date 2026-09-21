import express from "express";
import {
    redirectToGithub,
    githubCallback,
    getMe,
    refreshAuthToken,
    logout,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { authRateLimiter } from "../middleware/rateLimiter.middleware.js";

const router = express.Router();

// Apply auth rate limiter across all auth routes
router.use(authRateLimiter);

// Public OAuth routes
router.get("/github", redirectToGithub);
router.get("/github/callback", githubCallback);
router.post("/refresh", refreshAuthToken);

// Protected routes
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);

export default router;
