import "dotenv/config";
import connectDB from "./config/db.js";
import app from "./app.js";
import { validateCorsConfig } from "./config/cors.config.js";

import { cleanupStuckIngestions } from "./services/ingestionPreparation.service.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const HOST = process.env.HOST || "0.0.0.0";

// Validate CORS configuration early on server startup
try {
    validateCorsConfig();
} catch (err) {
    console.error("[CORS] Startup configuration validation failed:", err.message);
    if (process.env.NODE_ENV === "production") {
        process.exit(1);
    }
}

// Watchdog scheduler for interrupted ingestion recovery (Task T5)
let watchdogInterval = null;
let watchdogRunning = false;

function startIngestionWatchdog() {
    // 1. Startup catch-up: auto-fail orphaned jobs from previous process
    cleanupStuckIngestions().catch((err) => {
        console.error("[Watchdog] Initial recovery check failed:", err.message);
    });

    // 2. Periodic execution (every 60s) with overlap prevention
    watchdogInterval = setInterval(async () => {
        if (watchdogRunning) return;
        watchdogRunning = true;
        try {
            await cleanupStuckIngestions();
        } catch (err) {
            console.error("[Watchdog] Periodic cleanup error:", err.message);
        } finally {
            watchdogRunning = false;
        }
    }, 60_000);
}

function stopIngestionWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}

connectDB()
    .then(() => {
        const server = app.listen(PORT, HOST, () => {
            console.log(`Server is running on ${HOST}:${PORT} (NODE_ENV: ${process.env.NODE_ENV || "development"})`);
            startIngestionWatchdog();
        });

        // Graceful process shutdown
        const shutdown = () => {
            console.log("Shutting down server and ingestion watchdog...");
            stopIngestionWatchdog();
            server.close(() => {
                process.exit(0);
            });
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((err) => {
        console.error("Error while connecting to MongoDB:", err);
        process.exit(1);
    });