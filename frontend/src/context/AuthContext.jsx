import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, logoutUser } from '../services/authService';
import { clearAuthToken } from '../services/apiClient';

const AuthContext = createContext(null);

/**
 * Smallest possible auth state for this app -- no auth library existed
 * anywhere in the frontend before this (Task 46). `GET /api/auth/me` is
 * the sole source of truth for whether/who is logged in; nothing here
 * constructs a user from GitHub data or from the JWT itself.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'

  useEffect(() => {
    // Read before the first API request fires -- `apiClient.js`'s
    // `getAuthToken()` strips `?token=` from the URL as soon as it's read,
    // so this is the only point where "did we just arrive from Express's
    // real GitHub OAuth redirect" is still observable.
    const arrivedWithToken = new URLSearchParams(window.location.search).has('token');

    fetchCurrentUser()
      .then((fetchedUser) => {
        setUser(fetchedUser);
        setStatus('authenticated');
        if (arrivedWithToken) {
          navigate('/login', { replace: true });
        }
      })
      .catch(() => {
        setUser(null);
        setStatus('unauthenticated');
      });
    // Intentionally runs once: this establishes the session on initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Session may already be gone server-side -- clearing local state
      // below is what actually matters for the user.
    }
    clearAuthToken();
    setUser(null);
    setStatus('unauthenticated');
    navigate('/login', { replace: true });
  }, [navigate]);

  return <AuthContext.Provider value={{ user, status, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
