import Analysis from "../models/analyses.model.js";
import { analyzeEvolutionWithAI, calculateLocalHotspots } from "../services/evolution.service.js";

/**
 * Controller to handle Software Evolution & Hotspot Detection.
 */

// Sample mock repository commits/files for immediate demonstration if none provided
const DEMO_COMMITS = [
    {
        commit_sha: "c1a2b3c",
        message: "fix(auth): handle JWT token expiration edge case",
        files_changed: ["src/controllers/auth.controller.js", "src/middleware/auth.js"],
        author_name: "Developer A",
        author_email: "dev.a@example.com",
        committed_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
    },
    {
        commit_sha: "d4e5f6a",
        message: "refactor(auth): update session store and cookie parsing",
        files_changed: ["src/controllers/auth.controller.js", "src/utils/cookie.js"],
        author_name: "Developer B",
        author_email: "dev.b@example.com",
        committed_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
        commit_sha: "e7f8a9b",
        message: "feat(auth): add OAuth2 provider callback support",
        files_changed: ["src/controllers/auth.controller.js", "src/routes/auth.routes.js", "src/models/user.model.js"],
        author_name: "Developer A",
        author_email: "dev.a@example.com",
        committed_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
        commit_sha: "f1b2c3d",
        message: "fix(api): optimize database connection pooling",
        files_changed: ["src/config/db.js", "src/server.js"],
        author_name: "Developer C",
        author_email: "dev.c@example.com",
        committed_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()
    },
    {
        commit_sha: "a2b3c4d",
        message: "style(ui): update navigation bar spacing",
        files_changed: ["frontend/src/components/layout/Navbar.jsx"],
        author_name: "Developer D",
        author_email: "dev.d@example.com",
        committed_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString()
    }
];

const DEMO_FILES = [
    { path: "src/controllers/auth.controller.js", line_count: 420, content: "// auth controller logic" },
    { path: "src/middleware/auth.js", line_count: 140, content: "// auth middleware" },
    { path: "src/routes/auth.routes.js", line_count: 85, content: "// auth routes" },
    { path: "src/models/user.model.js", line_count: 190, content: "// user model" },
    { path: "src/config/db.js", line_count: 45, content: "// db config" },
    { path: "src/server.js", line_count: 35, content: "// server entry" },
    { path: "frontend/src/components/layout/Navbar.jsx", line_count: 120, content: "// navbar component" }
];

export const runEvolutionAnalysis = async (req, res) => {
    try {
        const { repositoryId, commitHistory, files, userId } = req.body;

        const targetRepoId = repositoryId || "default-repo";
        const commitsToAnalyze = commitHistory && commitHistory.length > 0 ? commitHistory : DEMO_COMMITS;
        const filesToAnalyze = files && files.length > 0 ? files : DEMO_FILES;

        const analysisResult = await analyzeEvolutionWithAI(
            targetRepoId,
            commitsToAnalyze,
            filesToAnalyze
        );

        // Optionally persist in MongoDB if database is connected
        if (userId && repositoryId) {
            try {
                await Analysis.create({
                    userId,
                    repositoryId,
                    analysisType: "evolution",
                    status: "completed",
                    model: "seis-evolution-engine",
                    score: analysisResult.hotspots[0]?.hotspot_score || 0,
                    result: analysisResult,
                    startedAt: new Date(),
                    completedAt: new Date()
                });
            } catch (dbErr) {
                console.warn("Could not save evolution analysis to MongoDB:", dbErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            data: analysisResult
        });
    } catch (error) {
        console.error("Evolution analysis failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to execute evolution & hotspot analysis",
            error: error.message
        });
    }
};

export const getEvolutionAnalysis = async (req, res) => {
    try {
        const { repoId } = req.params;

        // Try to fetch latest from DB if available
        let analysisDoc = null;
        try {
            analysisDoc = await Analysis.findOne({
                repositoryId: repoId,
                analysisType: "evolution"
            }).sort({ createdAt: -1 });
        } catch (e) {
            // DB might be offline, fallback gracefully
        }

        if (analysisDoc && analysisDoc.result) {
            return res.status(200).json({
                success: true,
                data: analysisDoc.result
            });
        }

        // Generate instant analysis with demo data
        const fallbackResult = await analyzeEvolutionWithAI(repoId, DEMO_COMMITS, DEMO_FILES);

        return res.status(200).json({
            success: true,
            data: fallbackResult
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching evolution analysis",
            error: error.message
        });
    }
};

export const getHotspots = async (req, res) => {
    try {
        const hotspots = calculateLocalHotspots(DEMO_COMMITS, DEMO_FILES);
        return res.status(200).json({
            success: true,
            data: {
                hotspots,
                totalHotspots: hotspots.length,
                highRiskCount: hotspots.filter((h) => h.risk_level === "high").length
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error retrieving code hotspots",
            error: error.message
        });
    }
};
