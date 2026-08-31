import jwt from "jsonwebtoken";

/**
 * Generate a JWT token for an authenticated user
 * @param {string|mongoose.Types.ObjectId} userId - User's MongoDB ID
 * @returns {string} Signed JWT token
 */
export const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        }
    );
};

/**
 * Verify a JWT token
 * @param {string} token - JWT token string
 * @returns {object} Decoded payload
 */
export const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};
