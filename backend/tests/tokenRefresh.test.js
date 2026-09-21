import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { generateToken, generateRefreshToken, verifyRefreshToken } from "../src/utils/jwt.util.js";
import { refreshAuthToken } from "../src/controllers/auth.controller.js";
import User from "../src/models/user.model.js";

describe("SEIS-AI TOKEN REFRESH ROTATION SUITE (Task #6)", () => {
    it("1. Generates and verifies valid refresh token DTO", () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret_key_123456";
        const userId = new mongoose.Types.ObjectId();

        const accessToken = generateToken(userId);
        const refreshToken = generateRefreshToken(userId);

        assert.equal(typeof accessToken, "string");
        assert.equal(typeof refreshToken, "string");

        const decodedRefresh = verifyRefreshToken(refreshToken);
        assert.equal(String(decodedRefresh.userId), String(userId));
        assert.equal(decodedRefresh.type, "refresh");
    });

    it("2. Successfully rotates tokens on valid refresh request", async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret_key_123456";
        const userId = new mongoose.Types.ObjectId();
        const refreshToken = generateRefreshToken(userId);

        const req = {
            body: { refreshToken },
            cookies: {},
        };

        let responseStatus = null;
        let responseJson = null;
        const cookiesSet = {};

        const res = {
            cookie: (name, val) => { cookiesSet[name] = val; },
            status: (code) => {
                responseStatus = code;
                return {
                    json: (data) => { responseJson = data; },
                };
            },
            json: (data) => { responseJson = data; },
        };

        // Mock User.findById
        const originalFindById = User.findById;
        User.findById = async function (id) {
            if (String(id) === String(userId)) {
                return { _id: userId, name: "Test User" };
            }
            return null;
        };

        try {
            await refreshAuthToken(req, res, () => {});

            if (!responseJson?.success) {
                console.log("Token refresh test failed response:", responseJson);
            }
            assert.equal(responseJson.success, true);
            assert.equal(typeof responseJson.token, "string");
            assert.equal(typeof responseJson.refreshToken, "string");
            assert.equal(typeof cookiesSet.token, "string");
            assert.equal(typeof cookiesSet.refreshToken, "string");
        } finally {
            User.findById = originalFindById;
        }
    });
});
