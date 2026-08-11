import express from "express";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "SEIS-AI Backend is running"
    });
});

export default app;