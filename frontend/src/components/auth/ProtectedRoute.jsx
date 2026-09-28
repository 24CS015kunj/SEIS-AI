import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Guards `/workspace`, `/import-repository`, `/source-control` (Task 46).
 * Manually navigating to one of these URLs while unauthenticated must not
 * be treated as logged in -- `status` comes only from a real
 * `GET /api/auth/me` call in `AuthContext`, never assumed from a stored
 * token's mere presence.
 */
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F6FA]">
        <div
          role="status"
          aria-label="Checking your session"
          className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
