import apiClient from './apiClient';

/**
 * Lists the authenticated user's already-synced repositories
 * (`GET /api/github/repositories`, unchanged from the existing Express API).
 */
export async function listRepositories() {
  const response = await apiClient.get('/api/github/repositories');
  return response.data.repositories;
}

/**
 * Synchronizes the authenticated user's GitHub repositories, optionally
 * associating every synced repository with `workspaceId`
 * (`POST /api/github/repositories/sync`, Task 43's optional `workspaceId`
 * body field -- unchanged here, just called for the first time from the UI).
 *
 * @param {string|null} [workspaceId]
 */
export async function syncRepositories(workspaceId) {
  const response = await apiClient.post(
    '/api/github/repositories/sync',
    workspaceId ? { workspaceId } : {}
  );
  return response.data.repositories;
}

/**
 * Fetches one real, already-synced repository's identity by its Mongo
 * `_id` (Task 71 -- `GET /api/github/repositories/:repositoryId`). This
 * is the canonical way to resolve a `repositoryId` found in the URL
 * (browser refresh, direct link) back into a real repository name/owner,
 * used in place of the old `location.state.repo` pattern (which does not
 * survive a refresh).
 *
 * @param {string} repositoryId
 * @returns {Promise<object>}
 */
export async function getRepository(repositoryId) {
  const response = await apiClient.get(`/api/github/repositories/${repositoryId}`);
  return response.data.repository;
}

/**
 * Fetches and synchronizes a repository's branches from GitHub
 * (`GET /api/github/repositories/:repositoryId/branches`, Task 37/43's
 * existing endpoint). This is the same call the ingestion prerequisite
 * relies on -- it upserts real `Branch` documents server-side, which is
 * exactly what `POST .../ingest` requires to exist before it will proceed
 * (Task 49/50). Not merely a read: a successful response here is what
 * satisfies that prerequisite.
 *
 * @param {string} repositoryId
 */
export async function getRepositoryBranches(repositoryId) {
  const response = await apiClient.get(`/api/github/repositories/${repositoryId}/branches`);
  return response.data.branches;
}

/**
 * Fetches (and synchronizes) commits for one branch of a repository
 * (`GET /api/github/repositories/:repositoryId/branches/:branchId/commits`,
 * the existing paginated endpoint -- Task 57). `branchId` is the branch's
 * real Mongo `_id` (from `getRepositoryBranches`), not its name.
 *
 * @param {string} repositoryId
 * @param {string} branchId
 * @param {{page?: number, limit?: number}} [options]
 * @returns {Promise<{commits: object[], total: number, count: number, page: number, totalPages: number}>}
 */
export async function getRepositoryCommits(repositoryId, branchId, options = {}) {
  const params = {};
  if (options.page) params.page = options.page;
  if (options.limit) params.limit = options.limit;
  const response = await apiClient.get(
    `/api/github/repositories/${repositoryId}/branches/${branchId}/commits`,
    { params }
  );
  return response.data;
}

/**
 * Fetches (and synchronizes) the file tree for one branch of a repository
 * (`GET /api/github/repositories/:repositoryId/branches/:branchId/files`,
 * the existing endpoint -- Task 58). `branchId` is the branch's real Mongo
 * `_id` (from `getRepositoryBranches`), not its name. Not paginated -- the
 * response's `count` already reflects every file/directory entry returned
 * in this one call; `truncated` is true only if GitHub's own tree API
 * truncated an unusually large tree, in which case `count` is a lower
 * bound, not the repository's true total.
 *
 * @param {string} repositoryId
 * @param {string} branchId
 * @returns {Promise<{files: object[], count: number, truncated: boolean}>}
 */
export async function getRepositoryFiles(repositoryId, branchId) {
  const response = await apiClient.get(
    `/api/github/repositories/${repositoryId}/branches/${branchId}/files`
  );
  return response.data;
}

/**
 * Fetches the real, aggregated Dashboard data for a repository (Task 68 --
 * `GET /api/github/repositories/:repositoryId/dashboard`). Every section
 * carries its own `available` flag; a `false` value means the data is
 * honestly missing (no recognized dependency manifest, no synced files,
 * etc.), never a fabricated placeholder.
 *
 * @param {string} repositoryId
 * @returns {Promise<object>}
 */
export async function getRepositoryDashboard(repositoryId) {
  const response = await apiClient.get(`/api/github/repositories/${repositoryId}/dashboard`);
  return response.data;
}

/**
 * Fetches the most recently persisted real repository analysis (Task 69 --
 * `GET /api/github/repositories/:repositoryId/analysis`). Never triggers
 * generation itself -- `analysis: null` means none has ever been
 * generated, a genuinely different fact from "analysis ran and found
 * nothing" (`analysis.insights` would then be `[]`).
 *
 * @param {string} repositoryId
 * @returns {Promise<{analysis: object|null, stale: boolean}>}
 */
export async function getRepositoryAnalysis(repositoryId) {
  const response = await apiClient.get(`/api/github/repositories/${repositoryId}/analysis`);
  return response.data;
}

/**
 * Triggers a real repository analysis run (Task 69 --
 * `POST /api/github/repositories/:repositoryId/analysis`): Express
 * collects bounded real commit/file evidence and FastAPI's deterministic
 * analysis pipeline (commit analysis -> churn/hotspot scoring -> trend
 * detection -> insight generation) computes real findings from it. No
 * LLM call, no ChromaDB write.
 *
 * @param {string} repositoryId
 * @returns {Promise<{analysis: object, stale: boolean}>}
 */
export async function generateRepositoryAnalysis(repositoryId) {
  const response = await apiClient.post(`/api/github/repositories/${repositoryId}/analysis`);
  return response.data;
}

/**
 * Sends one chat message to a repository's real AI Copilot pipeline
 * (`POST /api/github/repositories/:repositoryId/chat`, Task 59 -- proxies
 * to Task 54/55's live, already-verified FastAPI chat endpoint).
 * `conversationId` is generated client-side (the caller's responsibility,
 * see CopilotDrawer) and passed through unchanged -- FastAPI persists the
 * conversation history keyed by `(repository_id, conversation_id)` as of
 * Task 65 (Redis-backed, ConversationStore), so reusing the same id
 * across messages now gives the assistant real multi-turn context.
 *
 * @param {string} repositoryId
 * @param {string} message
 * @param {string} conversationId
 * @returns {Promise<{conversationId: string, answer: string, citations: object[], tokenUsage: object|null}>}
 */
export async function sendChatMessage(repositoryId, message, conversationId) {
  const response = await apiClient.post(
    `/api/github/repositories/${repositoryId}/chat`,
    { message, conversation_id: conversationId }
  );
  return response.data;
}

/**
 * Triggers ingestion for one repository (Task 44's endpoint). The frontend
 * never sends a `workspaceId` here -- the backend derives it exclusively
 * from the persisted `Repository.workspaceId` (Task 44's own guarantee).
 *
 * @param {string} repositoryId
 */
export async function ingestRepository(repositoryId) {
  const response = await apiClient.post(`/api/github/repositories/${repositoryId}/ingest`);
  return response.data;
}

/**
 * Fetches actual file content for one file in a repository (Task 83 --
 * `GET /api/github/repositories/:repositoryId/files/content?path=...`).
 *
 * @param {string} repositoryId
 * @param {string} filePath
 * @param {string} [ref]
 * @returns {Promise<{name: string, path: string, sha: string, size: number, content: string|null}>}
 */
export async function getRepositoryFileContent(repositoryId, filePath, ref) {
  const params = { path: filePath };
  if (ref) params.ref = ref;
  const response = await apiClient.get(
    `/api/github/repositories/${repositoryId}/files/content`,
    { params }
  );
  return response.data.file;
}

