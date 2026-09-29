import jwt from "jsonwebtoken";

/**
 * Generate a JWT token for an authenticated user
 * @param {string|mongoose.Types.ObjectId} userId - User's MongoDB ID
 * @returns {string} Signed JWT token
 */
export const generateToken = (userId, options = {}) => {
    const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || "30d";
    return jwt.sign(
        { userId, type: "access" },
        process.env.JWT_SECRET,
        {
            expiresIn,
        }
    );
};

/**
 * Generate a long-lived JWT refresh token for session rotation
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {string} Signed JWT refresh token
 */
export const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId, type: "refresh" },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + "_refresh",
        {
            expiresIn: "7d",
        }
    );
};

/**
 * Verify an Access JWT token
 * @param {string} token
 * @returns {object} Decoded payload
 */
export const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Verify a Refresh JWT token
 * @param {string} token
 * @returns {object} Decoded payload
 */
export const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + "_refresh");
};
