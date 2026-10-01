import axios from 'axios';

/**
 * Base URL for the Express backend (Task 45). No `.env` convention existed
 * anywhere in this frontend before this task -- `VITE_API_BASE_URL` is the
 * standard Vite pattern (`import.meta.env.VITE_*`), defaulting to Express's
 * own documented local dev port (`backend/.env`'s `PORT=5000`) so a fresh
 * clone works without any extra setup, matching `FRONTEND_URL=http://localhost:5173`
 * already configured on the Express side for CORS.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const AUTH_TOKEN_STORAGE_KEY = 'seis_auth_token';

/**
 * Reads the SEIS-AI JWT, if one is stored.
 *
 * Two sources, in order:
 *  1. `localStorage` -- where a previously-established session persists.
 *  2. The `#token=` fragment from the backend OAuth redirect. Fragments are
 *     not sent in HTTP requests or Referer headers. The old `?token=` form
 *     is accepted during the frontend/backend deployment transition.
 */
export function getAuthToken() {
  if (typeof window === 'undefined') return null;

  const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  const tokenFromFragment = fragmentParams.get('token');
  const tokenFromQuery = queryParams.get('token');
  const tokenFromUrl = tokenFromFragment || tokenFromQuery;
  if (tokenFromUrl) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenFromUrl);
    fragmentParams.delete('token');
    queryParams.delete('token');
    const cleanedSearch = queryParams.toString();
    const cleanedHash = tokenFromFragment ? fragmentParams.toString() : window.location.hash.slice(1);
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (cleanedSearch ? `?${cleanedSearch}` : '') + (cleanedHash ? `#${cleanedHash}` : '')
    );
    return tokenFromUrl;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Lets the httpOnly session cookie `auth.controller.js` sets flow
  // automatically once real cookie-based login exists -- harmless no-op
  // today, since no such cookie is set by anything in this frontend yet.
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 usually means the stored SEIS-AI token (if any) is dead -- drop it
// so the next request doesn't keep resending a token Express already
// rejected, and so `AuthContext`'s next `/api/auth/me` call correctly
// resolves to unauthenticated instead of retrying forever.
//
// One real exception: `github.controller.js`'s GitHub-facing endpoints
// (branches/commits/files/...) also return 401 when the *stored GitHub
// OAuth access token* is invalid/revoked (`github.service.js`'s
// `handleGitHubError`, message "GitHub Authentication failed: ...") -- a
// completely different failure from the caller's own SEIS-AI session being
// invalid. `auth.middleware.js`'s own 401s never start with "GitHub", so
// this is a safe, existing-message-shape way to tell them apart without a
// new response field. Treating a bad *GitHub* token as a dead *app* session
// was clearing a perfectly valid seis_auth_token and silently logging the
// user out on their next reload -- confirmed live: a GitHub token revoked
// on GitHub's side (real 401 "Bad credentials" from api.github.com) was
// triggering this exact mismatch.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isGithubUpstreamFailure = String(error.response?.data?.message || '').startsWith('GitHub');
    if (error.response?.status === 401 && !isGithubUpstreamFailure) {
      clearAuthToken();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
