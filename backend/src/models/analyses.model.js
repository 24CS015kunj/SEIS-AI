import mongoose from "mongoose";

const AnalysisSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        repositoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Repository",
            required: true
        },

        analysisType: {
            type: String,
            enum: [
                "code",
                "architecture",
                "documentation",
                "evolution"
            ],
            required: true
        },

        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "completed",
                "failed"
            ],
            default: "pending"
        },

        model: {
            type: String,
            default: null
        },

        score: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        },

        result: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        startedAt: {
            type: Date,
            default: null
        },

        completedAt: {
            type: Date,
            default: null
        },

        error: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

AnalysisSchema.index({
    repositoryId: 1,
    analysisType: 1,
    createdAt: -1
});

const Analysis = mongoose.model("Analysis", AnalysisSchema);

export default Analysis;