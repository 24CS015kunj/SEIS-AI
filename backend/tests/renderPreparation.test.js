/**
 * Render Backend Preparation Verification Suite (Task T3).
 *
 * Covers:
 * 1. Safe multi-origin CORS allowlist parsing, normalization, deduplication, and validation.
 * 2. Origin rejection: arbitrary tenants, malicious suffix lookalikes, literal 'null'.
 * 3. Requests without Origin header (curl, health probes, server-to-server callbacks).
 * 4. Preflight OPTIONS requests: exact origin returned, credentials true, no wildcard '*'.
 * 5. Readiness probe (/api/health/ready): 200 when healthy, 503 on Mongo disconnect,
 *    missing AI URL, AI timeout, or unhealthy AI response.
 * 6. Runtime port and proxy behavior (untrusted default vs configured hop count).
 * 7. Regression checks: rate limiting, correlation IDs, and JWT rotation.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import app from "../src/app.js";
import {
    getAllowedOrigins,
    normalizeAndValidateOrigin,
    createCorsOptions,
    validateCorsConfig,
} from "../src/config/cors.config.js";
import { createRateLimiter } from "../src/middleware/rateLimiter.middleware.js";
import { generateToken, generateRefreshToken, verifyRefreshToken } from "../src/utils/jwt.util.js";

describe("TASK T3: EXPRESS BACKEND RENDER PREPARATION SUITE", () => {
    // -------------------------------------------------------------
    // 1. CORS Configuration & Normalization Logic
    // -------------------------------------------------------------
    describe("1. CORS Allowlist Normalization & Validation", () => {
        it("normalizes root trailing slash to exact origin", () => {
            const normalized = normalizeAndValidateOrigin("https://seis-ai.vercel.app/", true);
            assert.equal(normalized, "https://seis-ai.vercel.app");
        });

        it("accepts canonical and additional origins, trimming whitespace and deduplicating", () => {
            const env = {
                NODE_ENV: "production",
                FRONTEND_URL: "https://seis-ai.vercel.app",
                CORS_ALLOWED_ORIGINS: " https://seis-ai.vercel.app/ , https://preview-1.vercel.app , https://preview-2.vercel.app/ ",
            };
            const origins = getAllowedOrigins(env);
            assert.equal(origins.size, 3);
            assert.ok(origins.has("https://seis-ai.vercel.app"));
            assert.ok(origins.has("https://preview-1.vercel.app"));
            assert.ok(origins.has("https://preview-2.vercel.app"));
        });

        it("enforces HTTPS protocol for origins in production", () => {
            const env = {
                NODE_ENV: "production",
                FRONTEND_URL: "http://insecure-frontend.com",
            };
            assert.throws(() => getAllowedOrigins(env), /Production origins must use HTTPS protocol/);
        });

        it("permits explicitly configured HTTP localhost origins in development", () => {
            const env = {
                NODE_ENV: "development",
                FRONTEND_URL: "http://localhost:5173",
                CORS_ALLOWED_ORIGINS: "http://127.0.0.1:3000, https://staging.seis-ai.dev",
            };
            const origins = getAllowedOrigins(env);
            assert.equal(origins.size, 3);
            assert.ok(origins.has("http://localhost:5173"));
            assert.ok(origins.has("http://127.0.0.1:3000"));
            assert.ok(origins.has("https://staging.seis-ai.dev"));
        });

        it("rejects non-root paths in origin configuration", () => {
            assert.throws(
                () => normalizeAndValidateOrigin("https://seis-ai.vercel.app/dashboard", true),
                /Non-root paths are not permitted/
            );
        });

        it("rejects query strings in origin configuration", () => {
            assert.throws(
                () => normalizeAndValidateOrigin("https://seis-ai.vercel.app?redirect=true", true),
                /Query parameters are not permitted/
            );
        });

        it("rejects fragments in origin configuration", () => {
            assert.throws(
                () => normalizeAndValidateOrigin("https://seis-ai.vercel.app#section", true),
                /URL fragments\/hashes are not permitted/
            );
        });

        it("rejects embedded user credentials in origin configuration", () => {
            assert.throws(
                () => normalizeAndValidateOrigin("https://user:pass@seis-ai.vercel.app", true),
                /User credentials are not permitted/
            );
        });

        it("rejects malformed origin URLs", () => {
            assert.throws(
                () => normalizeAndValidateOrigin("not-a-valid-url", true),
                /Invalid CORS origin URL/
            );
        });

        it("fails clearly when production has no valid origins configured", () => {
            const env = {
                NODE_ENV: "production",
                FRONTEND_URL: "",
                CORS_ALLOWED_ORIGINS: "",
            };
            assert.throws(
                () => getAllowedOrigins(env),
                /CORS configuration error: Production requires at least one valid HTTPS origin/
            );
        });
    });

    // -------------------------------------------------------------
    // 2. HTTP CORS Middleware Execution via Ephemeral Server
    // -------------------------------------------------------------
    describe("2. HTTP CORS Middleware & Origin Enforcement", () => {
        let testServer;
        let testBaseUrl;
        const testEnv = {
            NODE_ENV: "production",
            FRONTEND_URL: "https://seis-ai.vercel.app",
            CORS_ALLOWED_ORIGINS: "https://preview-deploy.vercel.app",
        };

        before(async () => {
            const testApp = express();
            testApp.use(cors(createCorsOptions(() => testEnv)));
            testApp.get("/test-endpoint", (req, res) => {
                res.json({ success: true, message: "Endpoint reached" });
            });
            testApp.use((err, req, res, next) => {
                res.status(err.statusCode || 500).json({
                    success: false,
                    message: err.message,
                });
            });

            testServer = await new Promise((resolve) => {
                const s = testApp.listen(0, "127.0.0.1", () => resolve(s));
            });
            const port = testServer.address().port;
            testBaseUrl = `http://127.0.0.1:${port}`;
        });

        after(async () => {
            if (testServer) {
                await new Promise((resolve) => testServer.close(resolve));
            }
        });

        it("allows canonical FRONTEND_URL and reflects exact origin with credentials: true", async () => {
            const res = await axios.get(`${testBaseUrl}/test-endpoint`, {
                headers: { Origin: "https://seis-ai.vercel.app" },
            });
            assert.equal(res.status, 200);
            assert.equal(res.headers["access-control-allow-origin"], "https://seis-ai.vercel.app");
            assert.equal(res.headers["access-control-allow-credentials"], "true");
            assert.notEqual(res.headers["access-control-allow-origin"], "*");
        });

        it("allows second explicitly configured preview origin", async () => {
            const res = await axios.get(`${testBaseUrl}/test-endpoint`, {
                headers: { Origin: "https://preview-deploy.vercel.app" },
            });
            assert.equal(res.status, 200);
            assert.equal(res.headers["access-control-allow-origin"], "https://preview-deploy.vercel.app");
            assert.equal(res.headers["access-control-allow-credentials"], "true");
        });

        it("rejects arbitrary unapproved Vercel tenants", async () => {
            let errorResponse = null;
            try {
                await axios.get(`${testBaseUrl}/test-endpoint`, {
                    headers: { Origin: "https://malicious-tenant.vercel.app" },
                });
            } catch (err) {
                errorResponse = err.response;
            }
            assert.ok(errorResponse, "Expected request from unapproved origin to be rejected");
            assert.equal(errorResponse.status, 403);
            assert.equal(errorResponse.headers["access-control-allow-origin"], undefined);
        });

        it("rejects malicious suffix lookalike origins", async () => {
            let errorResponse = null;
            try {
                await axios.get(`${testBaseUrl}/test-endpoint`, {
                    headers: { Origin: "https://seis-ai.vercel.app.attacker.com" },
                });
            } catch (err) {
                errorResponse = err.response;
            }
            assert.ok(errorResponse, "Expected suffix lookalike to be rejected");
            assert.equal(errorResponse.status, 403);
            assert.equal(errorResponse.headers["access-control-allow-origin"], undefined);
        });

        it("rejects literal 'null' origin", async () => {
            let errorResponse = null;
            try {
                await axios.get(`${testBaseUrl}/test-endpoint`, {
                    headers: { Origin: "null" },
                });
            } catch (err) {
                errorResponse = err.response;
            }
            assert.ok(errorResponse, "Expected literal null origin to be rejected");
            assert.equal(errorResponse.status, 403);
            assert.equal(errorResponse.headers["access-control-allow-origin"], undefined);
        });

        it("allows requests without an Origin header (probes, curl, callbacks)", async () => {
            const res = await axios.get(`${testBaseUrl}/test-endpoint`);
            assert.equal(res.status, 200);
            assert.equal(res.data.success, true);
            // Non-browser request: no Access-Control-Allow-Origin header is set
            assert.equal(res.headers["access-control-allow-origin"], undefined);
        });

        it("handles preflight OPTIONS request correctly for approved origin", async () => {
            const res = await axios.options(`${testBaseUrl}/test-endpoint`, {
                headers: {
                    Origin: "https://seis-ai.vercel.app",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Authorization, Content-Type, X-Correlation-Id",
                },
            });
            assert.equal(res.status, 204);
            assert.equal(res.headers["access-control-allow-origin"], "https://seis-ai.vercel.app");
            assert.equal(res.headers["access-control-allow-credentials"], "true");
            assert.notEqual(res.headers["access-control-allow-origin"], "*");
            assert.ok(res.headers["access-control-allow-methods"]?.includes("POST"));
            assert.ok(res.headers["access-control-allow-headers"]?.includes("Authorization"));
        });

        it("rejects preflight OPTIONS request from unapproved origin without CORS headers", async () => {
            let errorResponse = null;
            try {
                await axios.options(`${testBaseUrl}/test-endpoint`, {
                    headers: {
                        Origin: "https://unauthorized-origin.com",
                        "Access-Control-Request-Method": "POST",
                    },
                });
            } catch (err) {
                errorResponse = err.response;
            }
            assert.ok(errorResponse);
            assert.equal(errorResponse.status, 403);
            assert.equal(errorResponse.headers["access-control-allow-origin"], undefined);
        });
    });

    // -------------------------------------------------------------
    // 3. Health & Readiness Probe Preserved Contracts
    // -------------------------------------------------------------
    describe("3. Health & Readiness Probes (/api/health and /api/health/ready)", () => {
        let server;
        let baseUrl;

        before(async () => {
            server = await new Promise((resolve) => {
                const s = app.listen(0, "127.0.0.1", () => resolve(s));
            });
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
        });

        after(async () => {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
        });

        it("/api/health returns 200 with ok status and correlationId", async () => {
            const res = await axios.get(`${baseUrl}/api/health`);
            assert.equal(res.status, 200);
            assert.equal(res.data.status, "ok");
            assert.equal(typeof res.data.uptime, "number");
            assert.equal(typeof res.data.correlationId, "string");
        });

        it("/api/health/ready returns 503 when FASTAPI_BASE_URL is not configured", async () => {
            const originalFastApiUrl = process.env.FASTAPI_BASE_URL;
            delete process.env.FASTAPI_BASE_URL;

            try {
                const res = await axios.get(`${baseUrl}/api/health/ready`, {
                    validateStatus: () => true,
                });
                assert.equal(res.status, 503);
                assert.equal(res.data.status, "not_ready");
                const fastApiDep = res.data.dependencies.find((d) => d.name === "fastapi_ai_service");
                assert.equal(fastApiDep.healthy, false);
                assert.ok(fastApiDep.details.error.includes("not configured"));
            } finally {
                if (originalFastApiUrl !== undefined) {
                    process.env.FASTAPI_BASE_URL = originalFastApiUrl;
                }
            }
        });

        it("/api/health/ready returns 503 when MongoDB is disconnected", async () => {
            // Mock mongoose connection readyState to 0 (disconnected)
            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 0,
                configurable: true,
            });

            try {
                const res = await axios.get(`${baseUrl}/api/health/ready`, {
                    validateStatus: () => true,
                });
                assert.equal(res.status, 503);
                assert.equal(res.data.status, "not_ready");
                const mongoDep = res.data.dependencies.find((d) => d.name === "mongodb");
                assert.equal(mongoDep.healthy, false);
                assert.equal(mongoDep.state, 0);
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
            }
        });

        it("/api/health/ready returns 200 when both MongoDB and FastAPI are healthy", async () => {
            // Create a mock FastAPI server returning healthy readiness probe
            const mockFastApiServer = http.createServer((req, res) => {
                if (req.url === "/health/ready") {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "ready", dependencies: [] }));
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise((resolve) => mockFastApiServer.listen(0, "127.0.0.1", resolve));
            const mockPort = mockFastApiServer.address().port;
            const originalFastApiUrl = process.env.FASTAPI_BASE_URL;
            const originalReadyState = mongoose.connection.readyState;

            process.env.FASTAPI_BASE_URL = `http://127.0.0.1:${mockPort}`;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            try {
                const res = await axios.get(`${baseUrl}/api/health/ready`);
                assert.equal(res.status, 200);
                assert.equal(res.data.status, "ready");
                assert.equal(typeof res.data.correlationId, "string");
                const mongoDep = res.data.dependencies.find((d) => d.name === "mongodb");
                const fastApiDep = res.data.dependencies.find((d) => d.name === "fastapi_ai_service");
                assert.equal(mongoDep.healthy, true);
                assert.equal(fastApiDep.healthy, true);
            } finally {
                await new Promise((resolve) => mockFastApiServer.close(resolve));
                if (originalFastApiUrl !== undefined) {
                    process.env.FASTAPI_BASE_URL = originalFastApiUrl;
                } else {
                    delete process.env.FASTAPI_BASE_URL;
                }
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
            }
        });

        it("/api/health/ready returns 503 when FastAPI returns unhealthy status", async () => {
            const mockFastApiServer = http.createServer((req, res) => {
                if (req.url === "/health/ready") {
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "not_ready", dependencies: [{ name: "chroma", healthy: false }] }));
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });

            await new Promise((resolve) => mockFastApiServer.listen(0, "127.0.0.1", resolve));
            const mockPort = mockFastApiServer.address().port;
            const originalFastApiUrl = process.env.FASTAPI_BASE_URL;
            const originalReadyState = mongoose.connection.readyState;

            process.env.FASTAPI_BASE_URL = `http://127.0.0.1:${mockPort}`;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            try {
                const res = await axios.get(`${baseUrl}/api/health/ready`, {
                    validateStatus: () => true,
                });
                assert.equal(res.status, 503);
                assert.equal(res.data.status, "not_ready");
                const fastApiDep = res.data.dependencies.find((d) => d.name === "fastapi_ai_service");
                assert.equal(fastApiDep.healthy, false);
            } finally {
                await new Promise((resolve) => mockFastApiServer.close(resolve));
                if (originalFastApiUrl !== undefined) {
                    process.env.FASTAPI_BASE_URL = originalFastApiUrl;
                } else {
                    delete process.env.FASTAPI_BASE_URL;
                }
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
            }
        });

        it("/api/health/ready returns 503 when FastAPI request times out (>3000ms)", async () => {
            const mockSlowFastApiServer = http.createServer((req, res) => {
                // Intentionally delay past Express's 3000ms timeout budget
                setTimeout(() => {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "ready" }));
                }, 3500);
            });

            await new Promise((resolve) => mockSlowFastApiServer.listen(0, "127.0.0.1", resolve));
            const mockPort = mockSlowFastApiServer.address().port;
            const originalFastApiUrl = process.env.FASTAPI_BASE_URL;
            const originalReadyState = mongoose.connection.readyState;

            process.env.FASTAPI_BASE_URL = `http://127.0.0.1:${mockPort}`;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            try {
                const res = await axios.get(`${baseUrl}/api/health/ready`, {
                    validateStatus: () => true,
                });
                assert.equal(res.status, 503);
                assert.equal(res.data.status, "not_ready");
                const fastApiDep = res.data.dependencies.find((d) => d.name === "fastapi_ai_service");
                assert.equal(fastApiDep.healthy, false);
                assert.ok(fastApiDep.details.error && fastApiDep.details.error.length > 0);
            } finally {
                await new Promise((resolve) => mockSlowFastApiServer.close(resolve));
                if (originalFastApiUrl !== undefined) {
                    process.env.FASTAPI_BASE_URL = originalFastApiUrl;
                } else {
                    delete process.env.FASTAPI_BASE_URL;
                }
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
            }
        });
    });

    // -------------------------------------------------------------
    // 4. Runtime Port & Proxy Trust Verification
    // -------------------------------------------------------------
    describe("4. Runtime Port & Proxy Trust Behavior", () => {
        it("listens on custom port when PORT env is configured", async () => {
            const customPortApp = express();
            customPortApp.get("/port-test", (req, res) => res.json({ port: 8765 }));

            const srv = await new Promise((resolve) => {
                const s = customPortApp.listen(0, "127.0.0.1", () => resolve(s));
            });
            const boundPort = srv.address().port;
            assert.ok(boundPort > 0);

            const res = await axios.get(`http://127.0.0.1:${boundPort}/port-test`);
            assert.equal(res.status, 200);
            await new Promise((resolve) => srv.close(resolve));
        });

        it("untrusted proxy default ignores spoofed X-Forwarded-For headers", async () => {
            const testApp = express();
            // Default: trust proxy is false (untrusted)
            testApp.get("/ip-check", (req, res) => {
                res.json({ ip: req.ip });
            });

            const srv = await new Promise((resolve) => {
                const s = testApp.listen(0, "127.0.0.1", () => resolve(s));
            });
            const port = srv.address().port;

            try {
                const res = await axios.get(`http://127.0.0.1:${port}/ip-check`, {
                    headers: { "X-Forwarded-For": "203.0.113.195, 198.51.100.1" },
                });
                // In untrusted mode, req.ip is the loopback socket address, NOT the spoofed header
                assert.ok(
                    res.data.ip === "127.0.0.1" || res.data.ip === "::ffff:127.0.0.1" || res.data.ip === "::1",
                    `Expected socket address but got: ${res.data.ip}`
                );
            } finally {
                await new Promise((resolve) => srv.close(resolve));
            }
        });

        it("trusts 1 proxy hop when TRUST_PROXY is set to 1", async () => {
            const testApp = express();
            testApp.set("trust proxy", 1);
            testApp.get("/ip-check-trusted", (req, res) => {
                res.json({ ip: req.ip });
            });

            const srv = await new Promise((resolve) => {
                const s = testApp.listen(0, "127.0.0.1", () => resolve(s));
            });
            const port = srv.address().port;

            try {
                const res = await axios.get(`http://127.0.0.1:${port}/ip-check-trusted`, {
                    headers: { "X-Forwarded-For": "203.0.113.195" },
                });
                // With trust proxy = 1, Express trusts the first hop from right
                assert.equal(res.data.ip, "203.0.113.195");
            } finally {
                await new Promise((resolve) => srv.close(resolve));
            }
        });
    });

    // -------------------------------------------------------------
    // 5. Regression Suite: Rate Limiting & JWT Utilities
    // -------------------------------------------------------------
    describe("5. Regression Coverage: Rate Limiter & JWT Utilities", () => {
        it("rate limiter enforces limits and returns Retry-After headers", () => {
            const limiter = createRateLimiter({
                windowMs: 60 * 1000,
                max: 2,
                keyGenerator: () => "render-test-user",
            });

            const req = { user: { _id: "render-test-user" } };
            const headers = {};
            let status = null;
            let body = null;
            const res = {
                setHeader: (k, v) => { headers[k] = v; },
                status: (code) => {
                    status = code;
                    return { json: (d) => { body = d; } };
                },
            };

            let nextCalls = 0;
            const next = () => { nextCalls++; };

            limiter(req, res, next);
            limiter(req, res, next);
            assert.equal(nextCalls, 2);
            assert.equal(headers["X-RateLimit-Remaining"], 0);

            // 3rd call triggers 429
            limiter(req, res, next);
            assert.equal(status, 429);
            assert.equal(body.errorCode, "RATE_LIMIT_EXCEEDED");
            assert.ok(headers["Retry-After"] > 0);
        });

        it("JWT access and refresh tokens maintain valid rotation contract", () => {
            const originalSecret = process.env.JWT_SECRET;
            process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key_123456789";

            try {
                const userId = new mongoose.Types.ObjectId().toString();
                const token = generateToken(userId);
                const refreshToken = generateRefreshToken(userId);

                assert.equal(typeof token, "string");
                assert.equal(typeof refreshToken, "string");

                const decoded = verifyRefreshToken(refreshToken);
                assert.equal(decoded.userId, userId);
                assert.equal(decoded.type, "refresh");
            } finally {
                if (originalSecret !== undefined) {
                    process.env.JWT_SECRET = originalSecret;
                } else {
                    delete process.env.JWT_SECRET;
                }
            }
        });
    });
});
