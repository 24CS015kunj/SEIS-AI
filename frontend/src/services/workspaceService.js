import apiClient from './apiClient';

/**
 * Creates a workspace owned by the authenticated user (Task 43/45).
 * Sends only `name` -- `ownerId` is never accepted from the client on the
 * backend (`workspace.controller.js`), so it is never sent here either.
 *
 * @param {string} name
 * @returns {Promise<object>} the created workspace
 */
export async function createWorkspace(name) {
  const response = await apiClient.post('/api/workspaces', { name });
  return response.data.workspace;
}

/**
 * Lists every workspace owned by the authenticated user.
 * @returns {Promise<object[]>}
 */
export async function listWorkspaces() {
  const response = await apiClient.get('/api/workspaces');
  return response.data.workspaces;
}

const ACTIVE_WORKSPACE_KEY = 'seis_active_workspace';

/**
 * Gets the locally persisted active workspace object or null.
 * @returns {{_id: string, name: string}|null}
 */
export function getActiveWorkspace() {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists the active workspace to local storage.
 * @param {{_id: string, name: string}} workspace
 */
export function setActiveWorkspace(workspace) {
  try {
    if (workspace && workspace._id) {
      localStorage.setItem(
        ACTIVE_WORKSPACE_KEY,
        JSON.stringify({ _id: workspace._id, name: workspace.name })
      );
    }
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Clears the active workspace from local storage.
 */
export function clearActiveWorkspace() {
  try {
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    // Ignore
  }
}

