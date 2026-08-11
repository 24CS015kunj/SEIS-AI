import mongoose from "mongoose";

const RepositorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
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