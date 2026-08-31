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
