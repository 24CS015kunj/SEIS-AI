import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import Repository from "../src/models/repositories.model.js";
import { makeChatWithRepository } from "../src/controllers/github.controller.js";
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

const OWNER_USER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_REPOSITORY_ID = new mongoose.Types.ObjectId().toString();

function fakeSubmitChatMessage(response) {
    const calls = [];
    return {
        calls,
        submitChatMessage: async (repositoryId, payload) => {
            calls.push({ repositoryId, payload });
            return response;
        },
    };
}

const runAllTests = async () => {
    console.log("\n=========================================");
    console.log("   SEIS-AI REPOSITORY CHAT PROXY SUITE (Task 59)   ");
    console.log("=========================================\n");

    // ------------------------------------------------------------------
    // 1. A valid message reaches the real FastAPI chat pipeline exactly
    //    once, with the caller's message and conversation_id passed
    //    through unchanged, and the real answer/citations flow back.
    // ------------------------------------------------------------------
    console.log("1. Testing a valid chat message is proxied to FastAPI and the real answer is returned...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async (query) => {
            if (String(query.userId) !== OWNER_USER_ID) return null;
            return { _id: TEST_REPOSITORY_ID, userId: OWNER_USER_ID, owner: "seis-ai", name: "seis-ai-copilot" };
        };

        const fastapi = fakeSubmitChatMessage({
            success: true,
            conversationId: "conversation-123",
            answer: "The maze solver uses depth-first search.",
            citations: [{ file_path: "backend/maze.py", start_line: 10, end_line: 24, chunk_id: "c1" }],
            tokenUsage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        });

        const handler = makeChatWithRepository({ submitChatMessage: fastapi.submitChatMessage });
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: { message: "How does the maze solving algorithm work?", conversation_id: "conversation-123" },
            user: { _id: OWNER_USER_ID },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(fastapi.calls.length === 1, "exactly one FastAPI chat request occurs");
        assert(
            fastapi.calls[0].payload.message === "How does the maze solving algorithm work?" &&
                fastapi.calls[0].payload.conversation_id === "conversation-123",
            "the message and conversation_id are passed through unchanged"
        );
        assert(res.statusCode === 200, "a successful chat request returns 200");
        assert(res.body.success === true, "the response reports success");
        assert(res.body.answer === "The maze solver uses depth-first search.", "the real answer is returned unchanged");
        assert(
            res.body.citations.length === 1 && res.body.citations[0].file_path === "backend/maze.py",
            "the real citations are returned unchanged"
        );

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 2. Input validation: blank message / conversation_id are rejected
    //    before any FastAPI call, matching the frozen ChatRequest contract.
    // ------------------------------------------------------------------
    console.log("\n2. Testing blank message/conversation_id are rejected with 400 before calling FastAPI...");
    {
        const fastapi = fakeSubmitChatMessage({ success: true, answer: "x", citations: [] });
        const handler = makeChatWithRepository({ submitChatMessage: fastapi.submitChatMessage });
        const baseReq = { params: { repositoryId: TEST_REPOSITORY_ID }, user: { _id: OWNER_USER_ID } };

        const resNoMessage = mockRes();
        await handler({ ...baseReq, body: { conversation_id: "c1" } }, resNoMessage, () => {});
        assert(resNoMessage.statusCode === 400, "a missing message is rejected with 400");

        const resBlankMessage = mockRes();
        await handler({ ...baseReq, body: { message: "   ", conversation_id: "c1" } }, resBlankMessage, () => {});
        assert(resBlankMessage.statusCode === 400, "a whitespace-only message is rejected with 400");

        const resNoConversation = mockRes();
        await handler({ ...baseReq, body: { message: "hello" } }, resNoConversation, () => {});
        assert(resNoConversation.statusCode === 400, "a missing conversation_id is rejected with 400");

        assert(fastapi.calls.length === 0, "no FastAPI request occurs for any invalid input");
    }

    // ------------------------------------------------------------------
    // 3. Repository ownership is enforced exactly like every other
    //    repository-scoped route in this controller.
    // ------------------------------------------------------------------
    console.log("\n3. Testing repository ownership is enforced...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async (query) => {
            if (String(query.userId) === OWNER_USER_ID) {
                return { _id: TEST_REPOSITORY_ID, userId: OWNER_USER_ID, owner: "seis-ai", name: "seis-ai-copilot" };
            }
            return null;
        };

        const fastapi = fakeSubmitChatMessage({ success: true, answer: "x", citations: [] });
        const handler = makeChatWithRepository({ submitChatMessage: fastapi.submitChatMessage });
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: { message: "hello", conversation_id: "c1" },
            user: { _id: OTHER_USER_ID },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 404, "a non-owner requesting chat on another user's repository gets 404");
        assert(fastapi.calls.length === 0, "no FastAPI request occurs for a repository the caller doesn't own");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 4. A malformed repositoryId is rejected before any DB/FastAPI call.
    // ------------------------------------------------------------------
    console.log("\n4. Testing a malformed repositoryId is rejected with 400...");
    {
        const fastapi = fakeSubmitChatMessage({ success: true, answer: "x", citations: [] });
        const handler = makeChatWithRepository({ submitChatMessage: fastapi.submitChatMessage });
        const req = {
            params: { repositoryId: "not-a-valid-id" },
            body: { message: "hello", conversation_id: "c1" },
            user: { _id: OWNER_USER_ID },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 400, "a malformed repository ID is rejected with 400");
        assert(fastapi.calls.length === 0, "no FastAPI request occurs for a malformed repository ID");
    }

    // ------------------------------------------------------------------
    // 5. A real FastAPI failure (e.g. LLMError/RerankError) surfaces
    //    honestly -- never swallowed into a fabricated answer.
    // ------------------------------------------------------------------
    console.log("\n5. Testing a FastAPI chat failure surfaces honestly, never as a fabricated answer...");
    {
        const originalFindOne = Repository.findOne;
        Repository.findOne = async () => ({
            _id: TEST_REPOSITORY_ID,
            userId: OWNER_USER_ID,
            owner: "seis-ai",
            name: "seis-ai-copilot",
        });

        const fastapi = fakeSubmitChatMessage({
            success: false,
            statusCode: 503,
            errorCode: "VECTOR_DB_ERROR",
            reason: "ChromaDB is temporarily unavailable.",
        });
        const handler = makeChatWithRepository({ submitChatMessage: fastapi.submitChatMessage });
        const req = {
            params: { repositoryId: TEST_REPOSITORY_ID },
            body: { message: "hello", conversation_id: "c1" },
            user: { _id: OWNER_USER_ID },
        };
        const res = mockRes();
        await handler(req, res, () => {});

        assert(res.statusCode === 503, "the real upstream status code (503) is forwarded, not collapsed to 500");
        assert(res.body.success === false, "the response reports failure");
        assert(
            res.body.message === "ChromaDB is temporarily unavailable.",
            "the real failure reason is forwarded, never replaced with a fabricated answer"
        );
        assert(res.body.answer === undefined, "no answer field is present on a failed response");

        Repository.findOne = originalFindOne;
    }

    // ------------------------------------------------------------------
    // 6. HTTP-level auth boundary (matches ingestionWiring.test.js's own
    //    convention: only the unauthenticated-rejection path is exercised
    //    over a real HTTP server).
    // ------------------------------------------------------------------
    console.log("\n6. Testing the chat route requires authentication...");
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        try {
            await axios.post(`${baseUrl}/api/github/repositories/123/chat`, {
                message: "hello",
                conversation_id: "c1",
            });
        } catch (err) {
            assert(
                err.response.status === 401,
                "POST /api/github/repositories/:id/chat rejects unauthenticated request with 401"
            );
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
