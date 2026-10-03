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
const STAY_LOGGED_IN_STORAGE_KEY = 'seis_stay_logged_in';

/**
 * Returns whether the user opted to stay logged in across browser sessions.
 * Defaults to true so users aren't repeatedly prompted to log in.
 */
export function getStayLoggedInPreference() {
  if (typeof window === 'undefined') return true;
  const val = window.localStorage.getItem(STAY_LOGGED_IN_STORAGE_KEY);
  return val !== null ? val === 'true' : true;
}

/**
 * Persists the user's preference to stay logged in or use session-only auth.
 */
export function setStayLoggedInPreference(enabled) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STAY_LOGGED_IN_STORAGE_KEY, String(Boolean(enabled)));
}

/**
 * Saves the authentication token according to the user's stayLoggedIn choice:
 * - If true: stored in localStorage (survives browser restarts)
 * - If false: stored in sessionStorage (cleared when browser session ends)
 */
export function setAuthToken(token, stayLoggedIn = true) {
  if (typeof window === 'undefined' || !token) return;
  setStayLoggedInPreference(stayLoggedIn);
  if (stayLoggedIn) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

/**
 * Reads the SEIS-AI JWT token, if one is stored.
 * Sources in priority order:
 *  1. The `#token=` fragment or `?token=` query parameter from OAuth redirect.
 *  2. `localStorage` (if stayLoggedIn is true).
 *  3. `sessionStorage` (if stayLoggedIn is false).
 */
export function getAuthToken() {
  if (typeof window === 'undefined') return null;

  const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  const tokenFromFragment = fragmentParams.get('token');
  const tokenFromQuery = queryParams.get('token');
  const tokenFromUrl = tokenFromFragment || tokenFromQuery;

  const stayLoggedInParam =
    fragmentParams.get('stayLoggedIn') || queryParams.get('stayLoggedIn');

  if (tokenFromUrl) {
    const stayLoggedIn =
      stayLoggedInParam !== null
        ? stayLoggedInParam !== 'false'
        : getStayLoggedInPreference();

    setAuthToken(tokenFromUrl, stayLoggedIn);

    fragmentParams.delete('token');
    fragmentParams.delete('stayLoggedIn');
    queryParams.delete('token');
    queryParams.delete('stayLoggedIn');

    const cleanedSearch = queryParams.toString();
    const remainingHash = fragmentParams.toString();
    const cleanedHash = remainingHash ? `#${remainingHash}` : '';

    window.history.replaceState(
      {},
      '',
      window.location.pathname + (cleanedSearch ? `?${cleanedSearch}` : '') + cleanedHash
    );
    return tokenFromUrl;
  }

  return (
    window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
    window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  );
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
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
