/**
 * Centralized Error Handling Middleware
 * Provides standardized error responses across the backend application
 */
export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // Handle Mongoose Bad ObjectId (CastError)
    if (err.name === "CastError") {
        statusCode = 400;
        message = `Invalid resource identifier: ${err.value}`;
    }

    // Handle Mongoose Duplicate Key (E11000)
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0];
        message = `Duplicate value entered for ${field || "unique field"}.`;
    }

    // Handle Mongoose Validation Error
    if (err.name === "ValidationError") {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((val) => val.message)
            .join(", ");
    }

    // Handle JWT Errors
    if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "Invalid authentication token.";
    }

    if (err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "Authentication token expired. Please log in again.";
    }

    // Handle GitHub API errors if thrown with status
    if (err.response && err.response.status) {
        statusCode = err.response.status;
        message = err.response.data?.message || err.message;
    }

    // Don't expose internal stack trace in production
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};
