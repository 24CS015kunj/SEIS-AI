import { Router } from "express";
import { handleFastApiIngestionStatus } from "../controllers/webhook.controller.js";

const router = Router();

// Server-to-server FastAPI ingestion status callback webhook
router.post("/fastapi/ingestion-status", handleFastApiIngestionStatus);

export default router;
