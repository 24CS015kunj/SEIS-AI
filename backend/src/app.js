import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// CORS: the frontend (FRONTEND_URL) is a different origin than this API,
// and auth.controller.js sets an httpOnly session cookie the frontend must
// be able to send back on subsequent requests -- `credentials: true` is
// required for that, which in turn requires an explicit origin (not "*").
app.use(
    cors({
        origin: process.env.FRONTEND_URL,
        credentials: true,
    })
);

// Required for auth.middleware.js's `req.cookies.token` cookie-based
// fallback (used when no Authorization header is present) to actually
// see incoming cookies -- without this, req.cookies is undefined and
// that fallback path silently never engages.
app.use(cookieParser());

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "active",
        message: "SEIS-AI Backend is running",
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/workspaces", workspaceRoutes);

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Centralized error handler -- must be mounted last (Express convention:
// a 4-arg middleware is only ever invoked via next(err)).
app.use(errorHandler);

export default app;