import mongoose from "mongoose";

const RepositorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Not required (Task 43): repositories synced before a Workspace
        // concept existed have no legitimate workspace to backfill onto --
        // fabricating one (from userId, repository._id, etc.) was
        // explicitly rejected during the Task 42 investigation. Left null
        // until the owning user actually associates this repository with a
        // real, explicitly-created Workspace (see workspaceId handling in
        // github.controller.js's syncRepositories).
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Workspace",
            default: null
        },

        githubRepoId: {
            type: String,
            required: true
        },

        owner: {
            type: String,
            required: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        fullName: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            default: null
        },

        htmlUrl: {
            type: String,
            required: true
        },

        cloneUrl: {
            type: String
        },

        visibility: {
            type: String,
            enum: ["public", "private"]
        },

        isPrivate: {
            type: Boolean,
            default: false
        },

        isFork: {
            type: Boolean,
            default: false
        },

        isArchived: {
            type: Boolean,
            default: false
        },

        defaultBranch: {
            type: String,
            default: "main"
        },

        language: {
            type: String,
            default: null
        },

        stars: {
            type: Number,
            default: 0
        },

        forks: {
            type: Number,
            default: 0
        },

        watchers: {
            type: Number,
            default: 0
        },

        openIssues: {
            type: Number,
            default: 0
        },

        topics: {
            type: [String],
            default: []
        },

        license: {
            type: String,
            default: null
        },

        githubCreatedAt: {
            type: Date
        },

        githubUpdatedAt: {
            type: Date
        },

        githubPushedAt: {
            type: Date
        },

        lastFetchedAt: {
            type: Date
        },

        ingestionStatus: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending"
        },

        ingestionStage: {
            type: String,
            default: null
        },

        chunkCount: {
            type: Number,
            default: 0
        },

        lastIngestedAt: {
            type: Date,
            default: null
        },

        ingestionError: {
            type: String,
            default: null
        },

        lastIngestedCommitSha: {
            type: String,
            default: null
        },

        activeJobId: {
            type: String,
            default: null
        },

        lastHeartbeatAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);


//indexing concept 
RepositorySchema.index(
    { userId: 1, githubRepoId: 1 },
    { unique: true }
);

const Repository = mongoose.model("Repository", RepositorySchema);

export default Repository;