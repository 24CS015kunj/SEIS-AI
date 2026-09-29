import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import axios from "axios";
import authRoutes from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { correlationMiddleware } from "./middleware/correlation.middleware.js";
import { requestLoggerMiddleware } from "./middleware/requestLogger.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { getFastapiConfig } from "./config/fastapi.config.js";
import { createCorsOptions } from "./config/cors.config.js";

const app = express();

// Proxy trust configuration (Task T3)
// Defaults to untrusted (false) for security. When running behind a verified reverse proxy
// (e.g. Render edge balancer), TRUST_PROXY can be set to an explicit hop count (e.g. "1").
if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY.trim();
    const hopCount = parseInt(tp, 10);
    app.set("trust proxy", Number.isFinite(hopCount) ? hopCount : tp === "true" ? true : tp === "false" ? false : tp);
}

// 1. Correlation & Logging Middleware (Task #7)
app.use(correlationMiddleware);
app.use(requestLoggerMiddleware);

// 2. Safe Multi-Origin CORS & Cookie Middleware (Task T3)
app.use(cors(createCorsOptions()));

app.use(cookieParser());
app.use(express.json());

// Service Root Endpoint
app.get("/", (req, res) => {
    res.json({
        status: "active",
        message: "SEIS-AI Backend is running",
    });
});

// Liveness Probe Endpoint (Task #7)
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        correlationId: req.correlationId,
    });
});

// Deep Readiness Probe Endpoint (Task #7 / Task T3)
app.get("/api/health/ready", async (req, res) => {
    const mongoHealthy = mongoose.connection.readyState === 1;

    let fastapiHealthy = false;
    let fastapiDetails = null;

    try {
        const config = getFastapiConfig();
        if (config.baseUrl) {
            const url = `${config.baseUrl.replace(/\/+$/, "")}/health/ready`;
            const headers = {};
            if (req.correlationId) {
                headers["X-Correlation-Id"] = req.correlationId;
            }
            if (config.internalApiKey) {
                headers["Authorization"] = `Bearer ${config.internalApiKey}`;
            }
            const response = await axios.get(url, { headers, timeout: 3000 });
            fastapiHealthy = response.status === 200 && response.data?.status === "ready";
            fastapiDetails = response.data;
        } else {
            fastapiHealthy = false;
            fastapiDetails = { error: "FASTAPI_BASE_URL is not configured" };
        }
    } catch (err) {
        fastapiHealthy = false;
        fastapiDetails = { error: err.message };
    }

    const allHealthy = mongoHealthy && fastapiHealthy;
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json({
        status: allHealthy ? "ready" : "not_ready",
        correlationId: req.correlationId,
        dependencies: [
            { name: "mongodb", healthy: mongoHealthy, state: mongoose.connection.readyState },
            { name: "fastapi_ai_service", healthy: fastapiHealthy, details: fastapiDetails },
        ],
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/webhooks", webhookRoutes);

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        correlationId: req.correlationId,
    });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;