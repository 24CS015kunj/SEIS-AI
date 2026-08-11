import mongoose from "mongoose";

const CommitSchema = new mongoose.Schema(
    {
        repositoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Repository",
            required: true
        },

        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },

        githubSha: {
            type: String,
            required: true
        },

        message: {
            type: String,
            required: true,
            trim: true
        },
        author: {
            githubId: String,
            username: String,
            name: String,
            email: String
        },
        committer: {
            githubId: String,
            username: String,
            name: String,
            email: String
        },

        commitUrl: {
            type: String
        },

        committedAt: {
            type: Date,
            required: true
        },

        additions: {
            type: Number,
            default: 0
        },

        deletions: {
            type: Number,
            default: 0
        },

        changedFilesCount: {
            type: Number,
            default: 0
        },

        filesChanged: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true
    }
);

CommitSchema.index(
    { repositoryId: 1, githubSha: 1 },
    { unique: true }
);

const Commit = mongoose.model("Commit", CommitSchema);

export default Commit;