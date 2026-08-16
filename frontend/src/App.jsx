import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import WorkspaceCreationPage from './pages/WorkspaceCreationPage';
import ImportRepositoryPage from './pages/ImportRepositoryPage';
import AiRepositoryAnalysisPage from './pages/AiRepositoryAnalysisPage';
import CommandCenterPage from './pages/CommandCenterPage';
import SourceControlPage from './pages/SourceControlPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace" element={<WorkspaceCreationPage />} />
      <Route path="/import-repository" element={<ImportRepositoryPage />} />
      <Route path="/analysis" element={<AiRepositoryAnalysisPage />} />
      <Route path="/command-center" element={<CommandCenterPage />} />
      <Route path="/source-control" element={<SourceControlPage />} />
    </Routes>
  );
}
