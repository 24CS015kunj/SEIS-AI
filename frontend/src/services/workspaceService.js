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
 * Each workspace includes populated `defaultRepositoryId` if assigned.
 * @returns {Promise<object[]>}
 */
export async function listWorkspaces() {
  const response = await apiClient.get('/api/workspaces');
  const workspaces = response.data.workspaces || [];

  // Update cached default repositories from backend workspaces
  workspaces.forEach((ws) => {
    if (ws._id && ws.defaultRepositoryId) {
      const repoId = typeof ws.defaultRepositoryId === 'object' ? ws.defaultRepositoryId._id : ws.defaultRepositoryId;
      const repoName = typeof ws.defaultRepositoryId === 'object' ? (ws.defaultRepositoryId.fullName || ws.defaultRepositoryId.name) : null;
      if (repoId) {
        saveLocalDefaultRepository(ws._id, repoId, repoName);
      }
    }
  });

  return workspaces;
}

/**
 * Sets the default repository for a workspace on the backend.
 * @param {string} workspaceId
 * @param {string|null} repositoryId
 * @returns {Promise<object>} updated workspace
 */
export async function setDefaultRepository(workspaceId, repositoryId) {
  const response = await apiClient.patch(`/api/workspaces/${workspaceId}/default-repository`, {
    repositoryId: repositoryId || null,
  });
  return response.data.workspace;
}

const ACTIVE_WORKSPACE_KEY = 'seis_active_workspace';
const WS_DEFAULT_REPO_PREFIX = 'seis_ws_default_repo_';

/**
 * Gets the locally persisted active workspace object or null.
 * @returns {{_id: string, name: string, defaultRepositoryId?: string, defaultRepositoryName?: string}|null}
 */
export function getActiveWorkspace() {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!raw) return null;
    const ws = JSON.parse(raw);
    if (ws && ws._id) {
      const cachedRepo = getLocalDefaultRepository(ws._id);
      if (cachedRepo?.repositoryId && !ws.defaultRepositoryId) {
        ws.defaultRepositoryId = cachedRepo.repositoryId;
        ws.defaultRepositoryName = cachedRepo.repositoryName;
      }
    }
    return ws;
  } catch {
    return null;
  }
}

/**
 * Persists the active workspace to local storage.
 * @param {{_id: string, name: string, defaultRepositoryId?: any, defaultRepositoryName?: string}} workspace
 */
export function setActiveWorkspace(workspace) {
  try {
    if (workspace && workspace._id) {
      const defaultRepoId =
        typeof workspace.defaultRepositoryId === 'object'
          ? workspace.defaultRepositoryId?._id
          : workspace.defaultRepositoryId;
      const defaultRepoName =
        typeof workspace.defaultRepositoryId === 'object'
          ? (workspace.defaultRepositoryId?.fullName || workspace.defaultRepositoryId?.name)
          : workspace.defaultRepositoryName;

      const payload = {
        _id: workspace._id,
        name: workspace.name,
        defaultRepositoryId: defaultRepoId || null,
        defaultRepositoryName: defaultRepoName || null,
      };

      localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(payload));

      if (defaultRepoId) {
        saveLocalDefaultRepository(workspace._id, defaultRepoId, defaultRepoName);
      }
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

/**
 * Internal helper to save default repository info in local storage for a workspace.
 */
function saveLocalDefaultRepository(workspaceId, repositoryId, repositoryName = null) {
  if (!workspaceId) return;
  try {
    localStorage.setItem(
      `${WS_DEFAULT_REPO_PREFIX}${workspaceId}`,
      JSON.stringify({ repositoryId, repositoryName, updatedAt: Date.now() })
    );
  } catch {
    // Ignore
  }
}

/**
 * Internal helper to get default repository info from local storage for a workspace.
 */
function getLocalDefaultRepository(workspaceId) {
  if (!workspaceId) return null;
  try {
    const raw = localStorage.getItem(`${WS_DEFAULT_REPO_PREFIX}${workspaceId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Gets the default repository ID for a specific workspace.
 * @param {string} workspaceId
 * @returns {string|null}
 */
export function getDefaultRepositoryForWorkspace(workspaceId) {
  if (!workspaceId) return null;
  const local = getLocalDefaultRepository(workspaceId);
  if (local?.repositoryId) return local.repositoryId;

  const active = getActiveWorkspace();
  if (active?._id === workspaceId && active?.defaultRepositoryId) {
    return active.defaultRepositoryId;
  }

  return null;
}

/**
 * Gets the full default repository details (ID + name) for a specific workspace.
 * @param {string} workspaceId
 * @returns {{repositoryId: string, repositoryName: string|null}|null}
 */
export function getDefaultRepositoryDetailsForWorkspace(workspaceId) {
  if (!workspaceId) return null;
  const local = getLocalDefaultRepository(workspaceId);
  if (local?.repositoryId) return local;

  const active = getActiveWorkspace();
  if (active?._id === workspaceId && active?.defaultRepositoryId) {
    return {
      repositoryId: active.defaultRepositoryId,
      repositoryName: active.defaultRepositoryName || null,
    };
  }

  return null;
}

/**
 * Sets a repository as the default for a workspace both in local storage and on backend.
 * @param {string} workspaceId
 * @param {string} repositoryId
 * @param {string} [repositoryName]
 */
export function setDefaultRepositoryForWorkspace(workspaceId, repositoryId, repositoryName = null) {
  if (!workspaceId || !repositoryId) return;

  // 1. Immediately cache in local storage for instant zero-latency page transitions
  saveLocalDefaultRepository(workspaceId, repositoryId, repositoryName);

  // 2. Update active workspace state if it matches this workspace
  const active = getActiveWorkspace();
  if (active && active._id === workspaceId) {
    setActiveWorkspace({
      ...active,
      defaultRepositoryId: repositoryId,
      defaultRepositoryName: repositoryName || active.defaultRepositoryName,
    });
  }

  // 3. Persist asynchronously to backend MongoDB Workspace model
  setDefaultRepository(workspaceId, repositoryId).catch(() => {
    // Non-blocking: local cache preserves experience even if offline
  });
}
