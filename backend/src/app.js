import express from "express";
import authRoutes from "./routes/auth.routes.js";
import githubRoutes from "./routes/github.routes.js"
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "SEIS-AI Backend is running"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Server is healthy"
    });
});

// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/github", githubRoutes);


export default app;