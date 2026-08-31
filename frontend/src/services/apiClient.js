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
 *  2. The `?token=` query parameter -- the exact hand-off shape Express's
 *     `githubCallback` already produces when invoked with `redirect=true`
 *     (`res.redirect(`${FRONTEND_URL}?token=${token}`)`, `auth.controller.js`).
 *     Picking it up here (and persisting it) is the minimal, already-
 *     backend-supported bootstrap for whenever the real GitHub OAuth
 *     button is wired up -- no backend change needed for that to work.
 */
export function getAuthToken() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('token');
  if (tokenFromUrl) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenFromUrl);
    // Strip the token out of the visible URL so it isn't left in browser
    // history/referrer headers once it's safely persisted.
    params.delete('token');
    const cleanedSearch = params.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (cleanedSearch ? `?${cleanedSearch}` : '') + window.location.hash
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

// A 401 means the stored token (if any) is dead -- drop it so the next
// request doesn't keep resending a token Express already rejected, and so
// `AuthContext`'s next `/api/auth/me` call correctly resolves to
// unauthenticated instead of retrying forever.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthToken();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
