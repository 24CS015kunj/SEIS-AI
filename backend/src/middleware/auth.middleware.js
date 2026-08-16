import { verifyToken } from "../utils/jwt.util.js";
import User from "../models/user.model.js";

/**
 * Middleware to authenticate requests using SEIS-AI JWT
 * Identifies the logged-in user and attaches the user document to req.user
 */
export const protect = async (req, res, next) => {
    try {
        let token;

        // Check Authorization header for Bearer token
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies && (req.cookies.token || req.cookies.jwt)) {
            // Check cookies as fallback
            token = req.cookies.token || req.cookies.jwt;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authorized to access this route. No token provided.",
            });
        }

        // Verify JWT token
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: "Not authorized. Token is invalid or expired.",
            });
        }

        // Find user by ID and include the securely stored GitHub accessToken
        const user = await User.findById(decoded.userId).select("+accessToken");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User belonging to this token no longer exists.",
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
};
