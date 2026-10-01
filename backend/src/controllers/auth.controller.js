import User from "../models/user.model.js";
import { generateToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.util.js";
import * as githubService from "../services/github.service.js";
import * as emailService from "../services/email.service.js";
import { randomBytes, timingSafeEqual } from "node:crypto";

const oauthStateCookie = "github_oauth_state";
const oauthStateCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // GitHub returns by top-level navigation.
    maxAge: 10 * 60 * 1000,
});

/**
 * Redirects the user to GitHub's OAuth authorization page
 * GET /api/auth/github
 */
export const redirectToGithub = (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;
    const scope = encodeURIComponent("repo read:user user:email");

    if (!clientId || !callbackUrl) {
        return res.status(500).json({
            success: false,
            message: "GitHub OAuth is not configured in server environment.",
        });
    }

    const state = randomBytes(32).toString("base64url");
    res.cookie(oauthStateCookie, state, oauthStateCookieOptions());
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${scope}&state=${state}`;
    
    // If request asks for json or has query param json=true, return URL
    if (req.query.json === "true" || req.headers.accept?.includes("application/json")) {
        return res.json({
            success: true,
            authUrl: githubAuthUrl,
        });
    }

    return res.redirect(githubAuthUrl);
};

/**
 * Handles the GitHub OAuth callback
 * Exchanges code for access token, fetches profile, creates/updates user, signs JWT
 * GET /api/auth/github/callback
 */
export const githubCallback = async (req, res, next) => {
    try {
        const { code } = req.query;

        if (typeof code !== "string" || !code) {
            return res.status(400).json({
                success: false,
                message: "Authorization code is required in query parameters.",
            });
        }

        const expectedState = req.cookies?.[oauthStateCookie];
        const receivedState = req.query.state;
        const { maxAge, ...clearStateCookieOptions } = oauthStateCookieOptions();
        res.clearCookie(oauthStateCookie, clearStateCookieOptions);
        const expectedBytes = Buffer.from(typeof expectedState === "string" ? expectedState : "");
        const receivedBytes = Buffer.from(typeof receivedState === "string" ? receivedState : "");
        if (typeof expectedState !== "string" || typeof receivedState !== "string" ||
            expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length ||
            !timingSafeEqual(expectedBytes, receivedBytes)) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired GitHub OAuth state.",
            });
        }

        // 1. Exchange code for GitHub access token
        const accessToken = await githubService.exchangeCodeForToken(code);

        // 2. Fetch authenticated GitHub user profile
        const profile = await githubService.getAuthenticatedUser(accessToken);

        // 3. Find or create user in MongoDB
        let user = await User.findOne({ githubId: profile.githubId });
        let isNewUser = false;

        if (user) {
            // Update existing user profile and access token
            user.githubUsername = profile.githubUsername;
            user.name = profile.name || user.name;
            if (profile.email) user.email = profile.email;
            user.avatarUrl = profile.avatarUrl;
            user.bio = profile.bio;
            user.company = profile.company;
            user.location = profile.location;
            user.blog = profile.blog;
            user.twitterUsername = profile.twitterUsername;
            user.githubProfileUrl = profile.githubProfileUrl;
            user.publicRepos = profile.publicRepos;
            user.publicGists = profile.publicGists;
            user.followers = profile.followers;
            user.following = profile.following;
            user.githubCreatedAt = profile.githubCreatedAt;
            user.accessToken = accessToken;
            user.lastSyncedAt = new Date();
            await user.save();
        } else {
            // Create brand new user
            isNewUser = true;
            user = await User.create({
                ...profile,
                accessToken,
                lastSyncedAt: new Date(),
            });

            // Send welcome email asynchronously if email is present
            if (user.email) {
                emailService.sendWelcomeEmail(user.email, user.name || user.githubUsername).catch((err) => {
                    console.error("[Auth] Welcome email failed:", err.message);
                });
            }
        }

        // 4. Generate SEIS-AI Access & Refresh JWTs
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // 5. Set HTTP-only Cookies
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("token", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 15 * 60 * 1000, // 15 minutes
        });
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // 6. Return response without sensitive fields
        const sanitizedUser = user.toObject();
        delete sanitizedUser.accessToken;
        delete sanitizedUser.__v;

        // If redirect query or browser navigation is preferred
        if (req.query.redirect === "true" && process.env.FRONTEND_URL) {
            return res.redirect(`${process.env.FRONTEND_URL}#token=${encodeURIComponent(token)}`);
        }

        return res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser ? "User registered and authenticated successfully" : "User authenticated successfully",
            token,
            refreshToken,
            user: sanitizedUser,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Returns the currently authenticated user's profile
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
    const user = req.user.toObject();
    delete user.accessToken;
    delete user.__v;

    return res.json({
        success: true,
        user,
    });
};

/**
 * Rotates Access & Refresh tokens
 * POST /api/auth/refresh
 */
export const refreshAuthToken = async (req, res, next) => {
    try {
        const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "Refresh token is required.",
            });
        }

        const decoded = verifyRefreshToken(refreshToken);
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid refresh token or user not found.",
            });
        }

        const newAccessToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("token", newAccessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 15 * 60 * 1000,
        });

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.json({
            success: true,
            token: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired refresh token.",
            error: error.message,
        });
    }
};

/**
 * Logs out the user by clearing the auth cookie
 * POST /api/auth/logout
 */
export const logout = (req, res) => {
    res.clearCookie("token");
    res.clearCookie("refreshToken");
    return res.json({
        success: true,
        message: "Logged out successfully",
    });
};
