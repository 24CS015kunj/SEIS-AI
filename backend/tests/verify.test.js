import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import { generateToken, verifyToken } from "../src/utils/jwt.util.js";
import { protect } from "../src/middleware/auth.middleware.js";
import { errorHandler } from "../src/middleware/error.middleware.js";
import * as emailService from "../src/services/email.service.js";
import * as githubService from "../src/services/github.service.js";
import User from "../src/models/user.model.js";
import Repository from "../src/models/repositories.model.js";
import Branch from "../src/models/branches.model.js";
import Commit from "../src/models/commits.model.js";
import File from "../src/models/files.model.js";
import app from "../src/app.js";

let testsPassed = 0;
let testsFailed = 0;

const assert = (condition, testName) => {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        testsPassed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        testsFailed++;
    }
};

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI BACKEND VERIFICATION SUITE   ");
    console.log("=========================================\n");

    // 1. Testing JWT Utility
    console.log("1. Testing JWT Utilities...");
    const mockUserId = new mongoose.Types.ObjectId().toString();
    const token = generateToken(mockUserId);
    assert(typeof token === "string" && token.length > 20, "JWT generated successfully with valid signature");

    const decoded = verifyToken(token);
    assert(decoded.userId === mockUserId, "JWT verified and decoded payload matches userId");

    let invalidCaught = false;
    try {
        verifyToken("invalid.token.signature");
    } catch (e) {
        invalidCaught = true;
    }
    assert(invalidCaught, "Invalid JWT correctly throws signature error");

    // 2. Testing Mongoose Schemas & Model Definitions
    console.log("\n2. Testing Mongoose Schemas & Security Attributes...");
    
    // User Schema tests
    const userSchemaPaths = User.schema.paths;
    assert(userSchemaPaths.githubId.isRequired === true, "User.githubId is required");
    assert(userSchemaPaths.githubUsername.isRequired === true, "User.githubUsername is required");
    assert(userSchemaPaths.accessToken.options.select === false, "User.accessToken has select: false (secure, hidden by default)");

    // Repository Schema tests
    const repoSchemaPaths = Repository.schema.paths;
    assert(repoSchemaPaths.userId.isRequired === true, "Repository.userId is required");
    assert(repoSchemaPaths.githubRepoId.isRequired === true, "Repository.githubRepoId is required");
    assert(repoSchemaPaths.owner.isRequired === true, "Repository.owner is required");
    assert(repoSchemaPaths.name.isRequired === true, "Repository.name is required");

    // Branch Schema tests
    const branchSchemaPaths = Branch.schema.paths;
    assert(branchSchemaPaths.repositoryId.isRequired === true, "Branch.repositoryId is required");
    assert(branchSchemaPaths.name.isRequired === true, "Branch.name is required");

    // Commit Schema tests
    const commitSchemaPaths = Commit.schema.paths;
    assert(commitSchemaPaths.repositoryId.isRequired === true, "Commit.repositoryId is required");
    assert(commitSchemaPaths.branchId.isRequired === true, "Commit.branchId is required");
    assert(commitSchemaPaths.githubSha.isRequired === true, "Commit.githubSha is required");

    // File Schema tests
    const fileSchemaPaths = File.schema.paths;
    assert(fileSchemaPaths.repositoryId.isRequired === true, "File.repositoryId is required");
    assert(fileSchemaPaths.branchId.isRequired === true, "File.branchId is required");
    assert(fileSchemaPaths.path.isRequired === true, "File.path is required");
    assert(fileSchemaPaths.sha.isRequired === true, "File.sha is required");

    // 3. Testing Auth Middleware
    console.log("\n3. Testing Auth Middleware...");
    
    // Mock user lookup on User model for middleware test
    const originalFindById = User.findById;
    User.findById = (id) => ({
        select: (fields) => {
            if (id === mockUserId) {
                return Promise.resolve({
                    _id: mockUserId,
                    githubId: "998877",
                    githubUsername: "testdeveloper",
                    accessToken: "gho_test_secret_access_token",
                    email: "dev@seis-ai.local",
                });
            }
            return Promise.resolve(null);
        },
    });

    // Test with valid Bearer token
    let nextCalled = false;
    const mockReq = {
        headers: {
            authorization: `Bearer ${token}`,
        },
        cookies: {},
    };
    const mockRes = {
        status: (code) => ({
            json: (data) => ({ status: code, data }),
        }),
    };

    await protect(mockReq, mockRes, () => {
        nextCalled = true;
    });
    assert(nextCalled, "protect middleware allows valid token and invokes next()");
    assert(mockReq.user != null && mockReq.user.githubUsername === "testdeveloper", "protect attaches user object to req.user");
    assert(mockReq.user.accessToken === "gho_test_secret_access_token", "protect attaches secret accessToken for downstream GitHub API calls");

    // Test with missing token
    let unauthStatus = null;
    let unauthMsg = null;
    const unauthRes = {
        status: (code) => {
            unauthStatus = code;
            return {
                json: (data) => {
                    unauthMsg = data.message;
                },
            };
        },
    };
    await protect({ headers: {}, cookies: {} }, unauthRes, () => {});
    assert(unauthStatus === 401, "protect middleware rejects missing token with 401 status");
    assert(unauthMsg.includes("No token provided"), "protect middleware provides clear message for missing token");

    // Test with non-existent user
    let userNotFoundStatus = null;
    const missingUserToken = generateToken(new mongoose.Types.ObjectId().toString());
    await protect({ headers: { authorization: `Bearer ${missingUserToken}` } }, {
        status: (code) => {
            userNotFoundStatus = code;
            return { json: () => {} };
        },
    }, () => {});
    assert(userNotFoundStatus === 401, "protect middleware rejects tokens whose user no longer exists");

    // Restore User.findById
    User.findById = originalFindById;

    // 4. Testing Email Service
    console.log("\n4. Testing Email Service & Graceful Fallbacks...");
    
    const welcomeResult = await emailService.sendWelcomeEmail("developer@seis-ai.local", "Super Developer");
    assert(welcomeResult != null && typeof welcomeResult.success === "boolean", "sendWelcomeEmail executes safely without unhandled errors");

    const syncResult = await emailService.sendRepositorySyncEmail("developer@seis-ai.local", {
        repositoryCount: 3,
        branchesCount: 8,
        commitsCount: 95,
        filesCount: 312,
    });
    assert(syncResult != null && typeof syncResult.success === "boolean", "sendRepositorySyncEmail executes safely without throwing");

    const noEmailResult = await emailService.sendEmail({ to: "", subject: "Test", text: "Hello" });
    assert(noEmailResult.success === false && noEmailResult.error.includes("missing"), "sendEmail handles missing recipient address cleanly");

    // 5. Testing GitHub Service Error Handling & Function Exports
    console.log("\n5. Testing GitHub Service Interfaces...");
    assert(typeof githubService.exchangeCodeForToken === "function", "githubService exports exchangeCodeForToken");
    assert(typeof githubService.getAuthenticatedUser === "function", "githubService exports getAuthenticatedUser");
    assert(typeof githubService.getUserRepositories === "function", "githubService exports getUserRepositories");
    assert(typeof githubService.getRepositoryBranches === "function", "githubService exports getRepositoryBranches");
    assert(typeof githubService.getBranchCommits === "function", "githubService exports getBranchCommits");
    assert(typeof githubService.getRepositoryTree === "function", "githubService exports getRepositoryTree");
    assert(typeof githubService.getFileContent === "function", "githubService exports getFileContent");

    // 6. Testing Centralized Error Handling Middleware
    console.log("\n6. Testing Error Handling Middleware...");
    let errStatus = null;
    let errPayload = null;
    const testErrRes = {
        status: (code) => {
            errStatus = code;
            return {
                json: (data) => {
                    errPayload = data;
                },
            };
        },
    };

    // CastError
    const castErr = new Error("Cast failed");
    castErr.name = "CastError";
    castErr.value = "bad_object_id";
    errorHandler(castErr, {}, testErrRes, () => {});
    assert(errStatus === 400 && errPayload.message.includes("bad_object_id"), "errorHandler maps CastError to 400 with identifier info");

    // Duplicate Key Error (11000)
    const dupErr = new Error("E11000 duplicate key");
    dupErr.code = 11000;
    dupErr.keyValue = { githubId: "12345" };
    errorHandler(dupErr, {}, testErrRes, () => {});
    assert(errStatus === 409 && errPayload.message.includes("githubId"), "errorHandler maps 11000 duplicate key error to 409");

    // JWT Expired Error
    const expErr = new Error("jwt expired");
    expErr.name = "TokenExpiredError";
    errorHandler(expErr, {}, testErrRes, () => {});
    assert(errStatus === 401 && errPayload.message.includes("expired"), "errorHandler maps TokenExpiredError to 401");

    // 7. Testing HTTP Endpoints via Live Ephemeral Express Server
    console.log("\n7. Testing HTTP Server Endpoints...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // Base route
        const baseRes = await axios.get(`${baseUrl}/`);
        assert(baseRes.status === 200 && baseRes.data.status === "active", "GET / returns 200 with active status");

        // Health route
        const healthRes = await axios.get(`${baseUrl}/api/health`);
        assert(healthRes.status === 200 && healthRes.data.status === "ok", "GET /api/health returns 200 with OK status");

        // Auth GitHub URL generation
        const authRes = await axios.get(`${baseUrl}/api/auth/github?json=true`);
        assert(authRes.status === 200 && authRes.data.authUrl.includes("github.com/login/oauth/authorize"), "GET /api/auth/github returns valid GitHub OAuth URL");

        // Callback missing code validation
        try {
            await axios.get(`${baseUrl}/api/auth/github/callback`);
        } catch (err) {
            assert(err.response.status === 400 && err.response.data.message.includes("code is required"), "GET /api/auth/github/callback rejects missing code with 400");
        }

        // Protected routes reject unauthenticated requests
        try {
            await axios.get(`${baseUrl}/api/auth/me`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/auth/me rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/github/repositories`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories rejects unauthenticated request with 401");
        }

        try {
            await axios.post(`${baseUrl}/api/github/repositories/sync`);
        } catch (err) {
            assert(err.response.status === 401, "POST /api/github/repositories/sync rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/branches`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id/branches rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/branches/456/commits`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id/branches/:bid/commits rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/branches/456/files`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id/branches/:bid/files rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/github/repositories/123/files/content`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/github/repositories/:id/files/content rejects unauthenticated request with 401");
        }

        // 404 route handling
        try {
            await axios.get(`${baseUrl}/api/unknown/endpoint`);
        } catch (err) {
            assert(err.response.status === 404, "Unknown endpoints return standardized 404 response");
        }

    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log("\n=========================================");
    console.log(`  TEST RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log("=========================================\n");

    if (testsFailed > 0) {
        process.exit(1);
    }
};

runAllTests().catch((err) => {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
});
