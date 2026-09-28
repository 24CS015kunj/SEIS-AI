import mongoose from "mongoose";

const WorkspaceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Mirrors the existing per-parent-uniqueness convention already used by
// every other model here (Branch: {repositoryId, name}, Commit:
// {repositoryId, githubSha}, File: {repositoryId, branchId, path}) --
// one owner cannot create two workspaces with the same name.
WorkspaceSchema.index(
    { ownerId: 1, name: 1 },
    { unique: true }
);

const Workspace = mongoose.model("Workspace", WorkspaceSchema);

export default Workspace;
