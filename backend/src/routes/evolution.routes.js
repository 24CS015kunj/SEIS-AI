import { Router } from "express";
import {
    runEvolutionAnalysis,
    getEvolutionAnalysis,
    getHotspots
} from "../controllers/evolution.controller.js";

const router = Router();

// POST /api/evolution/analyze - Trigger evolution and hotspot calculation
router.post("/analyze", runEvolutionAnalysis);

// GET /api/evolution/hotspots - Get top code hotspots
router.get("/hotspots", getHotspots);

// GET /api/evolution/:repoId - Get latest evolution analysis for a repository
router.get("/:repoId", getEvolutionAnalysis);

export default router;
