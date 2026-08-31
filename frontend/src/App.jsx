import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkspaceCreationPage from './pages/WorkspaceCreationPage';
import ImportRepositoryPage from './pages/ImportRepositoryPage';
import CommandCenterPage from './pages/CommandCenterPage';
import ArchitecturePage from './pages/ArchitecturePage';
import SourceControlPage from './pages/SourceControlPage';
import SoftwareEvolutionPage from './pages/SoftwareEvolutionPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <WorkspaceCreationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/import-repository"
        element={
          <ProtectedRoute>
            <ImportRepositoryPage />
          </ProtectedRoute>
        }
      />
      {/* Task 71: `:repositoryId` is optional-by-duplication (two Route
          entries, not a `:repositoryId?` pattern -- React Router v6 has no
          optional-param syntax) so both a bare `/command-center` (the
          honest "no repository selected" state, Step 7) and
          `/command-center/<id>` (URL-persisted selection, survives
          refresh/direct link) render the same page component, which reads
          the id via `useParams()` inside each page.

          Command Center, Architecture, and Source Control share the exact
          same authenticated shell (CommandCenterSidebar/Header) -- all
          three are now gated behind ProtectedRoute consistently. Previously
          only Source Control was gated, so a signed-out visitor hitting
          Command Center/Architecture directly saw a generic "failed to
          load" error instead of a clean redirect to /login. */}
      <Route
        path="/command-center"
        element={
          <ProtectedRoute>
            <CommandCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/command-center/:repositoryId"
        element={
          <ProtectedRoute>
            <CommandCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/architecture"
        element={
          <ProtectedRoute>
            <ArchitecturePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/architecture/:repositoryId"
        element={
          <ProtectedRoute>
            <ArchitecturePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/source-control"
        element={
          <ProtectedRoute>
            <SourceControlPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/source-control/:repositoryId"
        element={
          <ProtectedRoute>
            <SourceControlPage />
          </ProtectedRoute>
        }
      />
      {/* Task 79: same dual-route/ProtectedRoute pattern as Command
          Center/Architecture/Source Control above. */}
      <Route
        path="/software-evolution"
        element={
          <ProtectedRoute>
            <SoftwareEvolutionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/software-evolution/:repositoryId"
        element={
          <ProtectedRoute>
            <SoftwareEvolutionPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
