import axios from "axios";

/**
 * Evolution Service - handles code churn, hotspot detection, and communication
 * with the FastAPI AI service or local analytics engine.
 */

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

/**
 * Computes hotspot metrics locally given commits and files (HotspotRisk = CommitCount * LineCount).
 * Normalized to 0.0 - 100.0.
 */
export function calculateLocalHotspots(commits = [], files = []) {
    const fileCommitCounts = {};

    // 1. Calculate file modification counts across commits
    for (const commit of commits) {
        const changedFiles = commit.files_changed || commit.files || [];
        for (const file of changedFiles) {
            fileCommitCounts[file] = (fileCommitCounts[file] || 0) + 1;
        }
    }

    const fileMap = new Map();
    for (const f of files) {
        const path = f.path || f.file_path;
        const lineCount = f.line_count || (f.content ? f.content.split("\n").length : 50);
        fileMap.set(path, lineCount);
    }

    // 2. Score candidates
    const candidates = [];
    let maxRawScore = 0;

    for (const [filePath, commitCount] of Object.entries(fileCommitCounts)) {
        const lineCount = fileMap.get(filePath) || 40; // Default estimate if content unavailable
        const rawScore = commitCount * lineCount;
        if (rawScore > maxRawScore) {
            maxRawScore = rawScore;
        }
        candidates.push({
            file_path: filePath,
            commit_count: commitCount,
            line_count: lineCount,
            raw_score: rawScore
        });
    }

    // 3. Normalize to [0.0, 100.0]
    const hotspots = candidates.map((item) => {
        const normalized = maxRawScore > 0 ? (item.raw_score / maxRawScore) * 100.0 : 0.0;
        let riskLevel = "low";
        if (normalized >= 70) riskLevel = "high";
        else if (normalized >= 35) riskLevel = "moderate";

        return {
            file_path: item.file_path,
            commit_count: item.commit_count,
            line_count: item.line_count,
            hotspot_score: Math.round(normalized * 10) / 10,
            risk_level: riskLevel
        };
    });

    // Sort descending by hotspot score
    hotspots.sort((a, b) => b.hotspot_score - a.hotspot_score);
    return hotspots;
}

/**
 * Dispatches evolution and hotspot analysis to the FastAPI AI service,
 * falling back to local computation if FastAPI is unreachable.
 */
export async function analyzeEvolutionWithAI(repositoryId, commitHistory, files) {
    try {
        const response = await axios.post(
            `${FASTAPI_URL}/api/v1/repositories/${repositoryId}/evolution`,
            {
                commit_history: commitHistory,
                files: files
            },
            {
                headers: {
                    Authorization: INTERNAL_API_KEY ? `Bearer ${INTERNAL_API_KEY}` : undefined,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            }
        );

        return {
            source: "fastapi-ai-service",
            ...response.data
        };
    } catch (err) {
        console.warn("FastAPI AI Service offline or returned error; using local evolution engine fallback.", err.message);

        // Fallback: local calculation
        const hotspots = calculateLocalHotspots(commitHistory, files);

        const highChurnFiles = hotspots.filter((h) => h.risk_level === "high").map((h) => h.file_path);

        const insights = [];
        if (highChurnFiles.length > 0) {
            insights.push({
                id: "hotspot-alert",
                severity: "critical",
                category: "Evolution & Hotspots",
                title: "High Risk Hotspots Detected",
                description: `${highChurnFiles.length} file(s) exhibit high churn combined with large size. Changes here are at high risk of regression.`,
                recommendation: `Consider breaking down ${highChurnFiles.slice(0, 2).join(", ")} into smaller, focused modules.`
            });
        }

        return {
            source: "local-evolution-engine",
            repository_id: repositoryId,
            generated_at: new Date().toISOString(),
            indexed_chunk_count: 0,
            hotspots: hotspots,
            trends: {
                module_trends: [],
                high_churn_modules: []
            },
            insights: insights,
            markdown: `# Software Evolution Report\n\nAnalyzed ${commitHistory.length} commits and ${files.length} files.\n\nTop Hotspot: ${hotspots[0]?.file_path || "None"}`
        };
    }
}
