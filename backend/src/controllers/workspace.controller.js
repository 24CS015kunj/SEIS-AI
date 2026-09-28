import Workspace from "../models/workspaces.model.js";

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
        const workspaces = await Workspace.find({ ownerId: req.user._id }).sort({ createdAt: -1 });

        return res.json({
            success: true,
            count: workspaces.length,
            workspaces,
        });
    } catch (error) {
        next(error);
    }
};
