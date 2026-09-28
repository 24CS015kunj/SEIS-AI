import apiClient from './apiClient';

/**
 * Returns the authenticated user's real profile from Express
 * (`GET /api/auth/me`, unchanged from the existing backend). The frontend
 * never constructs a user object from GitHub data itself -- this response
 * is the only source of truth for "who is logged in."
 */
export async function fetchCurrentUser() {
  const response = await apiClient.get('/api/auth/me');
  return response.data.user;
}

/**
 * Clears the backend session (`POST /api/auth/logout`, unchanged --
 * clears the httpOnly cookie server-side).
 */
export async function logoutUser() {
  const response = await apiClient.post('/api/auth/logout');
  return response.data;
}
