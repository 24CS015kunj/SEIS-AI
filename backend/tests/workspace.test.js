import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Workspace from "../src/models/workspaces.model.js";
import Repository from "../src/models/repositories.model.js";
import { createWorkspace, getWorkspaces } from "../src/controllers/workspace.controller.js";
import { syncRepositories } from "../src/controllers/github.controller.js";
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

/** Minimal Express-like res double: chainable .status().json(), default 200. */
function mockRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            res.statusCode = code;
            return res;
        },
        json(data) {
            res.body = data;
            return res;
        },
    };
    return res;
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI WORKSPACE SUITE (Task 43)   ");
    console.log("=========================================\n");

    // 1. Workspace schema
    console.log("1. Testing Workspace schema...");
    const workspacePaths = Workspace.schema.paths;
    assert(workspacePaths.name.isRequired === true, "Workspace.name is required");
    assert(workspacePaths.ownerId.isRequired === true, "Workspace.ownerId is required");
    assert(workspacePaths.ownerId.options.ref === "User", "Workspace.ownerId references the User model");

    const invalidWorkspace = new Workspace({});
    const workspaceValidationError = invalidWorkspace.validateSync();
    assert(
        workspaceValidationError != null &&
            workspaceValidationError.errors.name != null &&
            workspaceValidationError.errors.ownerId != null,
        "Workspace without name/ownerId actually fails runtime validation"
    );

    const workspaceIndexes = Workspace.schema.indexes();
    const hasOwnerNameUniqueIndex = workspaceIndexes.some(
        ([spec, options]) => spec.ownerId === 1 && spec.name === 1 && options.unique === true
    );
    assert(
        hasOwnerNameUniqueIndex,
        "Workspace has a unique {ownerId, name} index (one owner cannot create two same-named workspaces)"
    );

    // 2. Repository.workspaceId
    console.log("\n2. Testing Repository.workspaceId field...");
    const repoPaths = Repository.schema.paths;
    assert(repoPaths.workspaceId != null, "Repository.workspaceId field exists");
    assert(
        repoPaths.workspaceId.isRequired !== true,
        "Repository.workspaceId is NOT required (existing repositories remain valid without one)"
    );
    assert(
        repoPaths.workspaceId.options.ref === "Workspace",
        "Repository.workspaceId references the Workspace model"
    );

    const repoWithoutWorkspace = new Repository({
        userId: new mongoose.Types.ObjectId(),
        githubRepoId: "123",
        owner: "octocat",
        name: "hello-world",
        fullName: "octocat/hello-world",
        htmlUrl: "https://github.com/octocat/hello-world",
    });
    const repoValidationError = repoWithoutWorkspace.validateSync();
    assert(
        repoValidationError == null || repoValidationError.errors.workspaceId == null,
        "A Repository without workspaceId still passes validation (existing repositories are not invalidated)"
    );

    // 3. createWorkspace controller
    console.log("\n3. Testing createWorkspace controller...");
    const originalCreate = Workspace.create;
    let createCallArgs = null;
    Workspace.create = async (doc) => {
        createCallArgs = doc;
        return { _id: "ws-mongo-id-1", ...doc, createdAt: new Date(), updatedAt: new Date() };
    };

    {
        const req = {
            body: { name: "AI Research Lab", ownerId: "attacker-controlled-id" },
            user: { _id: "real-authenticated-user-id" },
        };
        const res = mockRes();
        await createWorkspace(req, res, () => {});
        assert(res.statusCode === 201, "createWorkspace returns 201 on success");
        assert(
            createCallArgs.ownerId === "real-authenticated-user-id",
            "createWorkspace uses req.user._id as ownerId, ignoring any client-supplied ownerId in the body"
        );
        assert(createCallArgs.name === "AI Research Lab", "createWorkspace passes the trimmed name through");
    }

    {
        const req = { body: { name: "   " }, user: { _id: "real-authenticated-user-id" } };
        const res = mockRes();
        await createWorkspace(req, res, () => {});
        assert(res.statusCode === 400, "createWorkspace rejects a blank/whitespace-only name with 400");
    }

    {
        const req = { body: {}, user: { _id: "real-authenticated-user-id" } };
        const res = mockRes();
        await createWorkspace(req, res, () => {});
        assert(res.statusCode === 400, "createWorkspace rejects a missing name with 400");
    }

    Workspace.create = originalCreate;

    // 4. getWorkspaces controller
    console.log("\n4. Testing getWorkspaces controller...");
    const originalFind = Workspace.find;
    let findFilter = null;
    Workspace.find = (filter) => {
        findFilter = filter;
        return {
            sort: () =>
                Promise.resolve([{ _id: "ws-1", name: "AI Research Lab", ownerId: "real-authenticated-user-id" }]),
        };
    };

    {
        const req = { user: { _id: "real-authenticated-user-id" } };
        const res = mockRes();
        await getWorkspaces(req, res, () => {});
        assert(res.statusCode === 200, "getWorkspaces returns 200 on success");
        assert(
            findFilter.ownerId === "real-authenticated-user-id",
            "getWorkspaces only queries workspaces owned by the authenticated user"
        );
        assert(res.body.success === true && res.body.count === 1, "getWorkspaces returns the matched workspaces");
    }

    Workspace.find = originalFind;

    // 5. syncRepositories optional workspaceId association (Task 43 §7)
    console.log("\n5. Testing syncRepositories optional workspaceId association...");
    const originalWorkspaceFindOne = Workspace.findOne;

    {
        const req = {
            user: { _id: "u1", accessToken: "gho_test" },
            body: { workspaceId: "not-a-valid-id" },
        };
        const res = mockRes();
        await syncRepositories(req, res, () => {});
        assert(res.statusCode === 400, "syncRepositories rejects a malformed workspaceId with 400");
    }

    {
        Workspace.findOne = async () => null;
        const validObjectId = new mongoose.Types.ObjectId().toString();
        const req = {
            user: { _id: "u1", accessToken: "gho_test" },
            body: { workspaceId: validObjectId },
        };
        const res = mockRes();
        await syncRepositories(req, res, () => {});
        assert(
            res.statusCode === 404,
            "syncRepositories rejects a workspaceId that doesn't belong to the authenticated user with 404"
        );
    }

    Workspace.findOne = originalWorkspaceFindOne;

    // 6. HTTP-level auth boundary (matches the existing verify.test.js
    // convention: only the unauthenticated-rejection path is exercised
    // over a real HTTP server, never the DB-touching success path).
    console.log("\n6. Testing workspace routes require authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.post(`${baseUrl}/api/workspaces`);
        } catch (err) {
            assert(err.response.status === 401, "POST /api/workspaces rejects unauthenticated request with 401");
        }

        try {
            await axios.get(`${baseUrl}/api/workspaces`);
        } catch (err) {
            assert(err.response.status === 401, "GET /api/workspaces rejects unauthenticated request with 401");
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
