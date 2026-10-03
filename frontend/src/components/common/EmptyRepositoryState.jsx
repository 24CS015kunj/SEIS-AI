import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Plus,
  ArrowRight,
  Sparkles,
  GitBranch,
  Boxes,
  TrendingUp,
  Lock,
  Globe,
  Star,
  Loader2,
} from 'lucide-react';
import { BrandGlyph } from './BrandMark';
import { listRepositories } from '../../services/repositoryService';

export default function EmptyRepositoryState({
  pageTitle = 'Engineering Intelligence',
  pageDescription = 'Connect a GitHub repository to explore real-time architecture graphs, commit impact, and AI copilot insights.',
  destinationPrefix = '/command-center',
}) {
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listRepositories()
      .then((data) => {
        if (active) {
          setRepositories(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenRepo = (repoId) => {
    navigate(`${destinationPrefix}/${repoId}`);
  };

  return (
    <div className="max-w-[840px] mx-auto py-10 px-4">
      {/* Hero Welcome Card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-white via-slate-50 to-blue-50/40 border border-slate-200 shadow-sm p-6 sm:p-8 text-center overflow-hidden mb-8">
        <div
          className="absolute -top-14 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-500/10 blur-3xl pointer-events-none rounded-full"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md shadow-blue-500/25 flex items-center justify-center mb-4">
            <BrandGlyph size={26} tone="onDark" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-2.5">
            <Sparkles size={12} />
            No Active Repository Selected
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-2">
            Welcome to {pageTitle}
          </h2>
          <p className="text-[13.5px] sm:text-[14px] text-slate-500 max-w-lg mx-auto leading-relaxed mb-6">
            {pageDescription}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/import-repository"
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold transition-all shadow-md shadow-blue-500/20 no-underline cursor-pointer"
            >
              <Plus size={16} />
              Connect a Repository
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/workspace"
              className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[13.5px] font-semibold transition-colors no-underline cursor-pointer"
            >
              Manage Workspaces
            </Link>
          </div>
        </div>
      </div>

      {/* Select Existing Repository Grid */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FolderGit2 size={16} className="text-blue-600" />
            <h3 className="text-[14px] font-bold text-slate-900 uppercase tracking-wider">
              Your Synced Repositories
            </h3>
          </div>
          {repositories.length > 0 && (
            <span className="text-[12px] font-medium text-slate-400">
              {repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'} available
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl">
            <Loader2 size={20} className="animate-spin text-blue-600 mx-auto mb-2" />
            <span className="text-[13px] text-slate-500">Checking for synced repositories…</span>
          </div>
        ) : repositories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
            <FolderGit2 size={28} className="text-slate-400 mx-auto mb-2" />
            <h4 className="text-[14px] font-semibold text-slate-700 mb-1">No repositories synced yet</h4>
            <p className="text-[13px] text-slate-500 mb-4 max-w-sm mx-auto">
              Sync your GitHub account to import repositories and unlock AI-powered engineering insights.
            </p>
            <Link
              to="/import-repository"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors no-underline"
            >
              <Plus size={14} />
              Import Repositories
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {repositories.map((repo) => (
              <button
                key={repo._id}
                type="button"
                onClick={() => handleOpenRepo(repo._id)}
                className="group flex flex-col justify-between text-left p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[14px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {repo.name}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 shrink-0">
                      {repo.visibility === 'private' ? <Lock size={10} /> : <Globe size={10} />}
                      {repo.visibility || 'public'}
                    </span>
                  </div>
                  <div className="text-[12px] font-mono text-slate-400 mb-2 truncate">
                    {repo.owner}
                  </div>
                  {repo.description && (
                    <p className="text-[12.5px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                      {repo.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[12px] text-slate-400">
                  <div className="flex items-center gap-3">
                    {repo.language && (
                      <span className="text-slate-600 font-medium">{repo.language}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star size={11} /> {repo.stars ?? 0}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    Open <ArrowRight size={13} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feature Pillars Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-8">
        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Boxes size={16} />
          </div>
          <div>
            <span className="block text-[13px] font-bold text-slate-900">Architecture Mapping</span>
            <span className="text-[12px] text-slate-500 leading-snug">AST dependency analysis & circular loops</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <span className="block text-[13px] font-bold text-slate-900">AI Engineering Copilot</span>
            <span className="text-[12px] text-slate-500 leading-snug">Semantic code search & grounding with citations</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp size={16} />
          </div>
          <div>
            <span className="block text-[13px] font-bold text-slate-900">Software Evolution</span>
            <span className="text-[12px] text-slate-500 leading-snug">Code churn, hotspots & risk scoring</span>
          </div>
        </div>
      </div>
    </div>
  );
}
