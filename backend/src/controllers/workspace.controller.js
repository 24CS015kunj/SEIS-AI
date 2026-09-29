import mongoose from "mongoose";
import Workspace from "../models/workspaces.model.js";
import Repository from "../models/repositories.model.js";

/**
 * Creates a workspace owned by the authenticated user.
 * POST /api/workspaces
 *
 * ownerId always comes from req.user (set by the `protect` middleware)
 * -- never from the request body, so a caller cannot create a workspace
 * on another user's behalf (§Task 43 instruction 5).
 */
export const createWorkspace = async (req, res, next) => {
    try {
        const name = req.body?.name?.trim();

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Workspace name is required.",
            });
        }

        const workspace = await Workspace.create({
            name,
            ownerId: req.user._id,
        });

        return res.status(201).json({
            success: true,
            workspace,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Lists every workspace owned by the authenticated user.
 * GET /api/workspaces
 */
export const getWorkspaces = async (req, res, next) => {
    try {
        let query = Workspace.find({ ownerId: req.user._id });
        if (typeof query.populate === "function") {
            query = query.populate("defaultRepositoryId", "name owner fullName defaultBranch status visibility language");
        }
        if (typeof query.sort === "function") {
            query = query.sort({ createdAt: -1 });
        }
        const workspaces = await query;

        return res.json({
            success: true,
            count: workspaces.length,
            workspaces,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Sets or clears the default repository for a workspace.
 * PATCH /api/workspaces/:workspaceId/default-repository
 */
export const setDefaultRepository = async (req, res, next) => {
    try {
        const { workspaceId } = req.params;
        const { repositoryId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workspace ID.",
            });
        }

        const workspace = await Workspace.findOne({ _id: workspaceId, ownerId: req.user._id });
        if (!workspace) {
            return res.status(404).json({
                success: false,
                message: "Workspace not found.",
            });
        }

        if (repositoryId) {
            if (!mongoose.Types.ObjectId.isValid(repositoryId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid repository ID.",
                });
            }

            const repo = await Repository.findOne({ _id: repositoryId, userId: req.user._id });
            if (!repo) {
                return res.status(404).json({
                    success: false,
                    message: "Repository not found or not owned by user.",
                });
            }

            // Associate repository with this workspace if not already associated
            if (!repo.workspaceId || String(repo.workspaceId) !== String(workspace._id)) {
                repo.workspaceId = workspace._id;
                await repo.save();
            }

            workspace.defaultRepositoryId = repo._id;
        } else {
            workspace.defaultRepositoryId = null;
        }

        await workspace.save();

        const updated = await Workspace.findById(workspace._id)
            .populate("defaultRepositoryId", "name owner fullName defaultBranch status visibility language");

        return res.json({
            success: true,
            workspace: updated,
        });
    } catch (error) {
        next(error);
    }
};
