import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import evolutionRoutes from "./routes/evolution.routes.js";

const app = express();

app.use(
    cors({
        origin: ["http://localhost:5173", "http://localhost:3000"],
        credentials: true
    })
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// Root health endpoint
app.get("/", (req, res) => {
    res.json({
        message: "SEIS-AI Backend is running"
    });
});

// API Routes
app.use("/api/evolution", evolutionRoutes);

export default app;