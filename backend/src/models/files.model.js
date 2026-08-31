import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
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

        path: {
            type: String,
            required: true
        },

        name: {
            type: String,
            required: true
        },

        extension: {
            type: String,
            default: null
        },

        type: {
            type: String,
            enum: ["file", "directory"],
            default: "file"
        },

        size: {
            type: Number,
            default: 0
        },

        sha: {
            type: String,
            required: true
        },

        htmlUrl: {
            type: String
        },

        language: {
            type: String,
            default: null
        },

        content: {
            type: String,
            default: null
        },

        contentHash: {
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

FileSchema.index(
    { repositoryId: 1, branchId: 1, path: 1 },
    { unique: true }
);

const File = mongoose.model("File", FileSchema);

export default File;