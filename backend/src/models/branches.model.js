import mongoose from "mongoose";

const BranchSchema = new mongoose.Schema(
    {
        repositoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Repository",
            required: true
        },

        githubBranchId: {
            type: String
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        isDefault: {
            type: Boolean,
            default: false
        },

        isProtected: {
            type: Boolean,
            default: false
        },

        latestCommitSha: {
            type: String,
            default: null
        },

        lastFetchedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

BranchSchema.index(
    { repositoryId: 1, name: 1 },
    { unique: true }
);

const Branch = mongoose.model("Branch", BranchSchema);

export default Branch;