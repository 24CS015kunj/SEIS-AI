import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Lock,
  Globe,
  Star,
  GitFork,
  Check,
  Loader2,
  AlertCircle,
  FolderGit2,
  RefreshCw,
  SearchX,
  ArrowRight,
  ChevronDown,
  Plus,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import BrandMark from '../components/common/BrandMark';
import FadeIn from '../components/common/FadeIn';
import OnboardingStepper from '../components/onboarding/OnboardingStepper';
import AiIngestionWizardModal from '../components/onboarding/AiIngestionWizardModal';
import { listRepositories, syncRepositories } from '../services/repositoryService';
import {
  listWorkspaces,
  getActiveWorkspace,
  setActiveWorkspace,
  getDefaultRepositoryForWorkspace,
  setDefaultRepositoryForWorkspace,
} from '../services/workspaceService';

const VISIBILITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

/**
 * Repositories page with persistent workspace resolution and manual sync.
 */
export default function ImportRepositoryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState(() => {
    if (location.state?.workspaceId) {
      return {
        _id: location.state.workspaceId,
        name: location.state.workspaceName || 'My Workspace',
      };
    }
    return getActiveWorkspace();
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const [repos, setRepos] = useState([]);
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | error
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | error
  const [syncError, setSyncError] = useState(null);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [language, setLanguage] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [ingestionModalOpen, setIngestionModalOpen] = useState(false);
  const [defaultRepoId, setDefaultRepoId] = useState(() => {
    return activeWorkspace?._id ? getDefaultRepositoryForWorkspace(activeWorkspace._id) : null;
  });

  useEffect(() => {
    if (activeWorkspace?._id) {
      setDefaultRepoId(getDefaultRepositoryForWorkspace(activeWorkspace._id));
    }
  }, [activeWorkspace?._id]);

  // Load existing workspaces to enable fast switching and auto-recovery
  useEffect(() => {
    let isMounted = true;
    listWorkspaces()
      .then((list) => {
        if (!isMounted || !Array.isArray(list) || list.length === 0) return;
        setWorkspaces(list);

        setActiveWorkspaceState((current) => {
          if (current?._id) {
            const found = list.find((w) => w._id === current._id);
            if (found) {
              setActiveWorkspace(found);
              return found;
            }
          }
          const defaultWs = list[0];
          setActiveWorkspace(defaultWs);
          return defaultWs;
        });
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectWorkspace = (ws) => {
    setActiveWorkspaceState(ws);
    setActiveWorkspace(ws);
    setDefaultRepoId(getDefaultRepositoryForWorkspace(ws._id));
    setWorkspaceMenuOpen(false);
  };

  const loadRepositories = () => {
    setLoadStatus('loading');
    listRepositories()
      .then((data) => {
        const safeRepos = Array.isArray(data) ? data : [];
        setRepos(safeRepos);
        setLoadStatus('ready');
        setSelectedId((current) => {
          if (current) return current;
          const currentDef = activeWorkspace?._id ? getDefaultRepositoryForWorkspace(activeWorkspace._id) : null;
          if (currentDef && safeRepos.some((r) => r._id === currentDef)) {
            return currentDef;
          }
          return safeRepos[0]?._id ?? null;
        });
      })
      .catch(() => {
        setRepos([]);
        setLoadStatus('error');
      });
  };

  useEffect(loadRepositories, []);

  const handleSync = () => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    setSyncError(null);
    syncRepositories(activeWorkspace?._id)
      .then(() => {
        setSyncStatus('idle');
        loadRepositories();
      })
      .catch((err) => {
        setSyncStatus('error');
        setSyncError(
          err.response?.data?.message || 'Failed to sync repositories from GitHub. Please try again.'
        );
      });
  };

  const languageOptions = useMemo(() => {
    const seen = new Map();
    for (const repo of (repos || [])) {
      if (repo?.language && !seen.has(repo.language)) seen.set(repo.language, true);
    }
    return [...seen.keys()];
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos || []).filter((repo) => {
      if (!repo) return false;
      if (visibility !== 'all' && repo.visibility !== visibility) return false;
      if (language && repo.language !== language) return false;
      if (
        q &&
        !(repo.name || '').toLowerCase().includes(q) &&
        !(repo.description || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [repos, query, visibility, language]);

  const selectedRepo = useMemo(
    () => (repos || []).find((r) => r?._id === selectedId) ?? null,
    [repos, selectedId]
  );

  const selectRepo = (id) => setSelectedId(id);

  const clearFilters = () => {
    setQuery('');
    setVisibility('all');
    setLanguage(null);
  };

  const handleSetDefaultRepo = (repo) => {
    if (!activeWorkspace?._id || !repo?._id) return;
    setDefaultRepositoryForWorkspace(
      activeWorkspace._id,
      repo._id,
      repo.fullName || repo.name
    );
    setDefaultRepoId(repo._id);
  };

  const openSelectedRepository = () => {
    if (!selectedRepo) return;
    if (activeWorkspace?._id) {
      setDefaultRepositoryForWorkspace(
        activeWorkspace._id,
        selectedRepo._id,
        selectedRepo.fullName || selectedRepo.name
      );
      setDefaultRepoId(selectedRepo._id);
    }
    setIngestionModalOpen(true);
  };

  const handleDirectCommandCenter = () => {
    if (!selectedRepo) return;
    if (activeWorkspace?._id) {
      setDefaultRepositoryForWorkspace(
        activeWorkspace._id,
        selectedRepo._id,
        selectedRepo.fullName || selectedRepo.name
      );
      setDefaultRepoId(selectedRepo._id);
    }
    navigate(`/command-center/${selectedRepo._id}`);
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex flex-col items-center justify-start px-4 sm:px-6 py-8 lg:py-12">
      <div className="w-full max-w-[1024px] mb-4">
        <OnboardingStepper
          currentStep={2}
          onStepClick={(step) => {
            if (step === 1) navigate('/workspace');
          }}
        />
      </div>

      <FadeIn direction="scale" className="w-full max-w-[1024px]">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] overflow-hidden">

          {/* ---------- Header ---------- */}
          <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-6 border-b border-[#E2E8F0]">
            <div className="flex items-start gap-3">
              <BrandMark size={36} />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                  Import GitHub Repositories
                </h1>
                <p className="text-[13.5px] text-slate-500 mt-1">
                  Sync and select a repository to connect to SEIS AI Copilot.
                </p>
              </div>
            </div>
            <Link
              to="/workspace"
              aria-label="Back to workspace setup"
              className="shrink-0 w-9 h-9 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <X size={17} aria-hidden="true" />
            </Link>
          </div>

          {/* ---------- Active Workspace Selector Toolbar ---------- */}
          <div className="bg-slate-50 border-b border-[#E2E8F0] px-6 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 relative">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Workspace:
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 text-[13px] font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  <LayoutGrid size={14} className="text-blue-600 shrink-0" />
                  <span className="max-w-[200px] truncate">{activeWorkspace?.name || 'Loading workspaces…'}</span>
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {workspaceMenuOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-1.5">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1.5">
                      Your Workspaces ({workspaces.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {workspaces.map((ws) => (
                        <button
                          key={ws._id}
                          type="button"
                          onClick={() => handleSelectWorkspace(ws)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-[12.5px] transition-colors cursor-pointer ${
                            activeWorkspace?._id === ws._id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{ws.name}</span>
                          {activeWorkspace?._id === ws._id && (
                            <Check size={14} className="text-blue-600 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <Link
                        to="/workspace"
                        className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Plus size={13} />
                        Create New Workspace
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Link
              to="/workspace"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              <Plus size={13} />
              New Workspace
            </Link>
          </div>

          {/* ---------- Search + filters + sync ---------- */}
          <div className="px-6 sm:px-8 pt-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <label htmlFor="repo-search" className="sr-only">Search repositories</label>
                <input
                  id="repo-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search repositories…"
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#E2E8F0] text-[14.5px] text-slate-900 focus-visible:border-blue-500 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncStatus === 'syncing'}
                aria-busy={syncStatus === 'syncing'}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-[#E2E8F0] bg-white text-slate-700 text-[13.5px] font-semibold transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 whitespace-nowrap"
              >
                <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} aria-hidden="true" />
                {syncStatus === 'syncing' ? 'Syncing…' : 'Sync from GitHub'}
              </button>
            </div>

            {syncStatus === 'error' && syncError && (
              <p role="alert" className="flex items-center gap-1.5 text-[13px] text-rose-600 mb-4">
                <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                {syncError}
              </p>
            )}

            {repos.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
                <div role="group" aria-label="Filter by visibility" className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Visibility</span>
                  {VISIBILITY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={visibility === f.value}
                      onClick={() => setVisibility(f.value)}
                      className={`h-7 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${
                        visibility === f.value
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {languageOptions.length > 0 && (
                  <>
                    <div aria-hidden="true" className="hidden sm:block w-px h-5 bg-[#E2E8F0]" />
                    <div role="group" aria-label="Filter by language" className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Language</span>
                      {languageOptions.map((lang) => {
                        const active = language === lang;
                        return (
                          <button
                            key={lang}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setLanguage(active ? null : lang)}
                            className={`h-7 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${
                              active
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {lang}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ---------- Body: list + sidebar ---------- */}
          <div className="flex flex-col lg:flex-row gap-5 px-6 sm:px-8 pb-6">
            <div className="flex-1 min-w-0">
              <p className="sr-only" role="status" aria-live="polite">
                {loadStatus === 'ready' ? `${filteredRepos.length} repositories found.` : 'Loading repositories…'}
              </p>

              <div className="border border-[#E2E8F0] rounded-xl overflow-y-auto max-h-[360px]">
                {loadStatus === 'loading' ? (
                  <RepoListSkeleton />
                ) : loadStatus === 'error' ? (
                  <ErrorResults />
                ) : repos.length === 0 ? (
                  <NoReposYet onSync={handleSync} syncing={syncStatus === 'syncing'} />
                ) : filteredRepos.length === 0 ? (
                  <EmptyResults onClear={clearFilters} />
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Repositories"
                    className="divide-y divide-[#EDF0F5]"
                  >
                    {filteredRepos.map((repo) => (
                      <RepoCard
                        key={repo._id}
                        repo={repo}
                        selected={repo._id === selectedId}
                        isDefault={repo._id === defaultRepoId}
                        onSelect={() => selectRepo(repo._id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:w-[280px] shrink-0">
              <SidebarPanel
                repo={selectedRepo}
                isDefault={selectedRepo?._id === defaultRepoId}
                onSetDefault={() => handleSetDefaultRepo(selectedRepo)}
                workspaceName={activeWorkspace?.name}
              />
            </div>
          </div>

          {/* ---------- Footer actions ---------- */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-6 sm:px-8 py-5 border-t border-[#E2E8F0] bg-slate-50/60">
            <Link
              to="/workspace"
              className="inline-flex items-center justify-center h-11 px-5 rounded-lg border border-[#E2E8F0] bg-white text-slate-700 text-[14px] font-semibold no-underline transition-colors hover:bg-slate-50 w-full sm:w-auto"
            >
              Back to Workspace
            </Link>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
              {selectedRepo && (
                <button
                  type="button"
                  onClick={handleDirectCommandCenter}
                  className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[13.5px] font-semibold transition-colors cursor-pointer w-full sm:w-auto"
                >
                  Direct to Dashboard
                </button>
              )}

              <button
                type="button"
                onClick={openSelectedRepository}
                disabled={!selectedRepo}
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[14px] font-semibold border-0 cursor-pointer transition-all shadow-md shadow-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto whitespace-nowrap"
              >
                <Sparkles size={16} />
                Connect & Activate AI Ingestion
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </FadeIn>

      <AiIngestionWizardModal
        isOpen={ingestionModalOpen}
        repository={selectedRepo}
        onClose={() => setIngestionModalOpen(false)}
      />
    </div>
  );
}

function RepoCard({ repo, selected, isDefault, onSelect }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors focus-visible:bg-blue-50/60 ${
        selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white group-hover:border-blue-400'
        }`}
      >
        {selected && <Check size={12} className="text-white" strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-slate-900 truncate">
            {repo.owner}/{repo.name}
          </span>
          <VisibilityBadge visibility={repo.visibility} />
          {isDefault && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <Check size={10} strokeWidth={3} />
              Default
            </span>
          )}
        </div>
        {repo.description && (
          <p className="text-[13px] text-slate-500 mt-1 leading-snug line-clamp-2">{repo.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] text-slate-500">
          {repo.language && <span className="whitespace-nowrap">{repo.language}</span>}
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><Star size={11} aria-hidden="true" />{repo.stars ?? 0}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><GitFork size={11} aria-hidden="true" />{repo.forks ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ visibility }) {
  const isPrivate = visibility === 'private';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 border border-[#E2E8F0] rounded-full px-2 py-0.5">
      {isPrivate ? <Lock size={10} aria-hidden="true" /> : <Globe size={10} aria-hidden="true" />}
      {isPrivate ? 'Private' : 'Public'}
    </span>
  );
}

function RepoListSkeleton() {
  return (
    <div className="divide-y divide-[#EDF0F5]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
          <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-64 bg-slate-100 rounded" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorResults() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center mb-3">
        <AlertCircle size={22} className="text-rose-500" aria-hidden="true" />
      </div>
      <p className="text-[14px] font-semibold text-slate-700 mb-1">Couldn't load repositories</p>
      <p className="text-[13px] text-slate-500">Check that you're logged in and try again.</p>
    </div>
  );
}

function NoReposYet({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
        <FolderGit2 size={22} className="text-blue-500" aria-hidden="true" />
      </div>
      <p className="text-[14px] font-semibold text-slate-700 mb-1">No repositories synced yet</p>
      <p className="text-[13px] text-slate-500 mb-4">Sync your GitHub account to see your repositories here.</p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold border-0 cursor-pointer transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {syncing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
        {syncing ? 'Syncing…' : 'Sync from GitHub'}
      </button>
    </div>
  );
}

function EmptyResults({ onClear }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
        <SearchX size={22} className="text-slate-400" aria-hidden="true" />
      </div>
      <p className="text-[14px] font-semibold text-slate-700 mb-1">No repositories found</p>
      <p className="text-[13px] text-slate-500 mb-4">Try a different search term or clear your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Clear filters
      </button>
    </div>
  );
}

function SidebarPanel({ repo, isDefault, onSetDefault, workspaceName }) {
  return (
    <div className="lg:sticky lg:top-0">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
        Selected Repository
      </span>

      {!repo ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-slate-50/50 px-4 py-8 text-center">
          <p className="text-[13px] text-slate-500 m-0">Select a repository to see its details.</p>
        </div>
      ) : (
        <>
          <div className="relative rounded-xl p-[1.5px] bg-gradient-to-r from-blue-500 to-indigo-500 mb-3">
            <div className="rounded-[10px] bg-white p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FolderGit2 size={15} className="text-blue-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-slate-900 truncate">{repo.name}</div>
                  <div className="text-[11.5px] text-slate-400 truncate">
                    {typeof repo.owner === 'object' ? repo.owner?.login || 'Repository' : repo.owner}
                  </div>
                </div>
              </div>
              <div
                className={`flex items-center gap-1.5 text-[12px] font-semibold ${
                  repo.workspaceId ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {repo.workspaceId ? (
                  <>
                    <Check size={12} aria-hidden="true" />
                    Associated with this workspace
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} aria-hidden="true" />
                    Not associated with a workspace
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Workspace Default Repository Indicator & Action */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-slate-800">
                  Workspace Default
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {isDefault
                    ? `Default for ${workspaceName || 'this workspace'}`
                    : `Make default for ${workspaceName || 'this workspace'}`}
                </div>
              </div>
              {isDefault ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Check size={11} strokeWidth={2.5} />
                  Default
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onSetDefault}
                  className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  Set as Default
                </button>
              )}
            </div>
          </div>

          <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#EDF0F5] mb-4">
            <StatRow icon={Star} label="Stars" value={repo.stars ?? 0} />
            <StatRow icon={GitFork} label="Forks" value={repo.forks ?? 0} />
            <StatRow icon={repo.visibility === 'private' ? Lock : Globe} label="Visibility" value={repo.visibility ?? 'unknown'} />
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-[12.5px] text-slate-500">
                <Sparkles size={14} className="text-blue-500" aria-hidden="true" />
                AI Indexing
              </span>
              <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                repo.ingestionStatus === 'completed'
                  ? 'bg-emerald-50 text-emerald-700'
                  : repo.ingestionStatus === 'processing'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {repo.ingestionStatus === 'completed'
                  ? 'Active & Indexed'
                  : repo.ingestionStatus === 'processing'
                    ? 'Processing…'
                    : 'Ready to Activate'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="inline-flex items-center gap-2 text-[12.5px] text-slate-500">
        <Icon size={14} className="text-slate-400" aria-hidden="true" />
        {label}
      </span>
      <span className="text-[12.5px] font-bold text-slate-900">{value}</span>
    </div>
  );
}
