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
    <div className="min-h-screen w-full bg-[var(--seis-canvas)] flex flex-col items-center justify-start px-4 sm:px-6 py-8 lg:py-10">
      <div className="w-full max-w-[1060px] mb-4">
        <OnboardingStepper
          currentStep={2}
          onStepClick={(step) => {
            if (step === 1) navigate('/workspace');
          }}
        />
      </div>

      <FadeIn direction="scale" className="w-full max-w-[1060px]">
        <div className="bg-[var(--seis-surface-1)] border border-[var(--seis-border-subtle)] rounded-lg shadow-sm overflow-hidden">

          {/* ---------- Header ---------- */}
          <div className="flex items-start justify-between gap-4 px-6 sm:px-7 py-5 border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)]">
            <div className="flex items-start gap-3">
              <BrandMark size={32} />
              <div>
                <h1 className="text-base sm:text-lg font-bold text-[var(--seis-text-primary)] leading-tight font-mono tracking-tight">
                  Repository Ingestion Ledger
                </h1>
                <p className="text-[12.5px] text-[var(--seis-text-secondary)] mt-0.5">
                  Select a target GitHub repository to extract AST dependencies and calculate commit churn.
                </p>
              </div>
            </div>
            <Link
              to="/workspace"
              aria-label="Back to workspace setup"
              className="shrink-0 w-8 h-8 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] flex items-center justify-center text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)] hover:border-[var(--seis-border-strong)] transition-colors"
            >
              <X size={15} aria-hidden="true" />
            </Link>
          </div>

          {/* ---------- Active Workspace Selector Toolbar ---------- */}
          <div className="bg-[var(--seis-surface-2)] border-b border-[var(--seis-border-subtle)] px-6 sm:px-7 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-[12px]">
            <div className="flex items-center gap-2 relative">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)]">
                ACTIVE WORKSPACE:
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] hover:border-[var(--seis-border-strong)] text-[var(--seis-text-primary)] font-semibold transition-colors cursor-pointer"
                >
                  <LayoutGrid size={13} className="text-blue-500 shrink-0" />
                  <span className="max-w-[200px] truncate">{activeWorkspace?.name || 'Loading workspaces…'}</span>
                  <ChevronDown size={12} className={`text-[var(--seis-text-muted)] transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {workspaceMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-[var(--seis-surface-1)] border border-[var(--seis-border-strong)] rounded shadow-lg z-30 p-1.5 font-mono">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] px-2 py-1">
                      Registered Workspaces ({workspaces.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {workspaces.map((ws) => (
                        <button
                          key={ws._id}
                          type="button"
                          onClick={() => handleSelectWorkspace(ws)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-[11.5px] transition-colors cursor-pointer ${
                            activeWorkspace?._id === ws._id
                              ? 'bg-blue-500/10 text-blue-500 font-semibold'
                              : 'text-[var(--seis-text-secondary)] hover:bg-[var(--seis-surface-2)] hover:text-[var(--seis-text-primary)]'
                          }`}
                        >
                          <span className="truncate">{ws.name}</span>
                          {activeWorkspace?._id === ws._id && (
                            <Check size={13} className="text-blue-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-[var(--seis-border-subtle)] mt-1 pt-1">
                      <Link
                        to="/workspace"
                        className="flex items-center gap-1.5 px-2 py-1 text-[11.5px] font-medium text-blue-500 hover:underline"
                      >
                        <Plus size={12} />
                        New Workspace
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Link
              to="/workspace"
              className="inline-flex items-center gap-1 text-[11.5px] font-bold text-blue-500 hover:underline"
            >
              <Plus size={12} />
              Manage Workspaces
            </Link>
          </div>

          {/* ---------- Search + filters + sync ---------- */}
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex flex-col sm:flex-row gap-2.5 mb-3.5">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--seis-text-muted)]" aria-hidden="true" />
                <label htmlFor="repo-search" className="sr-only">Search repositories</label>
                <input
                  id="repo-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by repository name or description…"
                  className="w-full h-9 pl-9 pr-3 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] text-[13px] font-mono text-[var(--seis-text-primary)] focus:border-blue-500 transition-colors placeholder:text-[var(--seis-text-muted)]"
                />
              </div>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncStatus === 'syncing'}
                aria-busy={syncStatus === 'syncing'}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] hover:border-[var(--seis-border-strong)] text-[12px] font-mono font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} aria-hidden="true" />
                {syncStatus === 'syncing' ? 'Syncing GitHub…' : 'Sync GitHub Repos'}
              </button>
            </div>

            {syncStatus === 'error' && syncError && (
              <p role="alert" className="flex items-center gap-1.5 text-[12px] font-mono text-rose-500 mb-3">
                <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                {syncError}
              </p>
            )}

            {repos.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 font-mono text-[11.5px]">
                <div role="group" aria-label="Filter by visibility" className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mr-0.5">Visibility:</span>
                  {VISIBILITY_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={visibility === f.value}
                      onClick={() => setVisibility(f.value)}
                      className={`h-6 px-2.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        visibility === f.value
                          ? 'bg-[var(--seis-brand-blue)] border-[var(--seis-brand-blue)] text-white font-bold'
                          : 'bg-[var(--seis-surface-2)] border-[var(--seis-border-subtle)] text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {languageOptions.length > 0 && (
                  <>
                    <div aria-hidden="true" className="hidden sm:block w-px h-4 bg-[var(--seis-border-subtle)]" />
                    <div role="group" aria-label="Filter by language" className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mr-0.5">Language:</span>
                      {languageOptions.map((lang) => {
                        const active = language === lang;
                        return (
                          <button
                            key={lang}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setLanguage(active ? null : lang)}
                            className={`h-6 px-2.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                              active
                                ? 'bg-[var(--seis-surface-3)] border-[var(--seis-border-strong)] text-[var(--seis-text-primary)] font-bold'
                                : 'bg-[var(--seis-surface-2)] border-[var(--seis-border-subtle)] text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)]'
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
          <div className="flex flex-col lg:flex-row gap-4 px-6 sm:px-7 pb-6 font-mono">
            <div className="flex-1 min-w-0">
              <p className="sr-only" role="status" aria-live="polite">
                {loadStatus === 'ready' ? `${filteredRepos.length} repositories found.` : 'Loading repositories…'}
              </p>

              <div className="border border-[var(--seis-border-subtle)] rounded bg-[var(--seis-surface-2)] overflow-y-auto max-h-[360px]">
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
                    className="divide-y divide-[var(--seis-border-subtle)]"
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

            <div className="lg:w-[300px] shrink-0">
              <SidebarPanel
                repo={selectedRepo}
                isDefault={selectedRepo?._id === defaultRepoId}
                onSetDefault={() => handleSetDefaultRepo(selectedRepo)}
                workspaceName={activeWorkspace?.name}
              />
            </div>
          </div>

          {/* ---------- Footer actions ---------- */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-6 sm:px-7 py-4 border-t border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] font-mono">
            <Link
              to="/workspace"
              className="inline-flex items-center justify-center h-9 px-3.5 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] text-[12px] font-medium no-underline transition-colors w-full sm:w-auto"
            >
              &larr; Workspace View
            </Link>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
              {selectedRepo && (
                <button
                  type="button"
                  onClick={handleDirectCommandCenter}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] hover:border-[var(--seis-border-strong)] text-[var(--seis-text-primary)] text-[12px] font-medium transition-colors cursor-pointer w-full sm:w-auto"
                >
                  Direct to Overview
                </button>
              )}

              <button
                type="button"
                onClick={openSelectedRepository}
                disabled={!selectedRepo}
                className="btn-tool-primary inline-flex items-center justify-center gap-2 h-9 px-4 rounded text-[12.5px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto whitespace-nowrap cursor-pointer"
              >
                <Sparkles size={14} />
                Activate Ingestion Pipeline
                <ArrowRight size={14} aria-hidden="true" />
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
      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
        selected ? 'bg-blue-500/10' : 'hover:bg-[var(--seis-surface-3)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
          selected
            ? 'bg-[var(--seis-brand-blue)] border-[var(--seis-brand-blue)] text-white'
            : 'border-[var(--seis-border-strong)] bg-[var(--seis-surface-1)] group-hover:border-blue-500'
        }`}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-[var(--seis-text-primary)] font-mono truncate">
            {repo.owner}/{repo.name}
          </span>
          <VisibilityBadge visibility={repo.visibility} />
          {isDefault && (
            <span className="badge-ast">
              DEFAULT REPO
            </span>
          )}
        </div>
        {repo.description && (
          <p className="text-[12px] text-[var(--seis-text-secondary)] mt-0.5 line-clamp-1 font-sans">{repo.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-mono text-[var(--seis-text-muted)]">
          {repo.language && <span className="font-semibold text-[var(--seis-text-secondary)]">{repo.language}</span>}
          <span className="inline-flex items-center gap-1"><Star size={10} aria-hidden="true" />{repo.stars ?? 0}</span>
          <span className="inline-flex items-center gap-1"><GitFork size={10} aria-hidden="true" />{repo.forks ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ visibility }) {
  const isPrivate = visibility === 'private';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-[var(--seis-text-muted)] border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-3)] rounded px-1.5 py-0.5">
      {isPrivate ? <Lock size={9} aria-hidden="true" /> : <Globe size={9} aria-hidden="true" />}
      {isPrivate ? 'PRIVATE' : 'PUBLIC'}
    </span>
  );
}

function RepoListSkeleton() {
  return (
    <div className="divide-y divide-[var(--seis-border-subtle)]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
          <div className="w-4 h-4 rounded bg-[var(--seis-surface-3)] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 bg-[var(--seis-surface-3)] rounded" />
            <div className="h-2.5 w-64 bg-[var(--seis-surface-3)] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorResults() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 font-mono">
      <div className="w-10 h-10 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-2.5">
        <AlertCircle size={18} className="text-rose-500" aria-hidden="true" />
      </div>
      <p className="text-[13px] font-bold text-[var(--seis-text-primary)] mb-1">Failed to Load Repositories</p>
      <p className="text-[12px] text-[var(--seis-text-muted)]">Check active GitHub token session and retry.</p>
    </div>
  );
}

function NoReposYet({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 font-mono">
      <div className="w-10 h-10 rounded bg-[var(--seis-surface-3)] border border-[var(--seis-border-subtle)] flex items-center justify-center mb-2.5">
        <FolderGit2 size={18} className="text-blue-500" aria-hidden="true" />
      </div>
      <p className="text-[13px] font-bold text-[var(--seis-text-primary)] mb-1">No GitHub Repositories Synced</p>
      <p className="text-[12px] text-[var(--seis-text-muted)] mb-3.5">Trigger GitHub synchronization to populate your repository list.</p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="btn-tool-primary inline-flex items-center gap-1.5 h-8 px-3 rounded text-[12px] font-semibold cursor-pointer"
      >
        {syncing ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
        {syncing ? 'Syncing…' : 'Sync GitHub Repos'}
      </button>
    </div>
  );
}

function EmptyResults({ onClear }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 font-mono">
      <div className="w-10 h-10 rounded bg-[var(--seis-surface-3)] border border-[var(--seis-border-subtle)] flex items-center justify-center mb-2.5">
        <SearchX size={18} className="text-[var(--seis-text-muted)]" aria-hidden="true" />
      </div>
      <p className="text-[13px] font-bold text-[var(--seis-text-primary)] mb-1">No Matching Repositories</p>
      <p className="text-[12px] text-[var(--seis-text-muted)] mb-3.5">No repositories matched your search query or language filter.</p>
      <button
        type="button"
        onClick={onClear}
        className="h-8 px-3 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] text-[12px] font-medium text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] cursor-pointer"
      >
        Reset Filters
      </button>
    </div>
  );
}

function SidebarPanel({ repo, isDefault, onSetDefault, workspaceName }) {
  return (
    <div className="lg:sticky lg:top-0 font-mono">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-2">
        TELEMETRY TARGET SPEC
      </span>

      {!repo ? (
        <div className="rounded border border-dashed border-[var(--seis-border-strong)] bg-[var(--seis-surface-2)] px-4 py-8 text-center">
          <p className="text-[12px] text-[var(--seis-text-muted)] m-0">Select a repository to inspect metadata.</p>
        </div>
      ) : (
        <>
          <div className="rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] p-3 mb-2.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded bg-[var(--seis-surface-3)] border border-[var(--seis-border-subtle)] flex items-center justify-center shrink-0">
                <FolderGit2 size={14} className="text-blue-500" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[var(--seis-text-primary)] truncate">{repo.name}</div>
                <div className="text-[11px] text-[var(--seis-text-muted)] truncate">
                  {typeof repo.owner === 'object' ? repo.owner?.login || 'Repository' : repo.owner}
                </div>
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 text-[11px] font-medium ${
                repo.workspaceId ? 'text-emerald-500' : 'text-amber-500'
              }`}
            >
              {repo.workspaceId ? (
                <>
                  <Check size={11} aria-hidden="true" />
                  Linked to Workspace
                </>
              ) : (
                <>
                  <AlertCircle size={11} aria-hidden="true" />
                  Unassigned Workspace
                </>
              )}
            </div>
          </div>

          {/* Workspace Default Repository Indicator & Action */}
          <div className="rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] p-2.5 mb-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11.5px] font-bold text-[var(--seis-text-primary)]">
                  Default Target
                </div>
                <div className="text-[10.5px] text-[var(--seis-text-muted)] truncate">
                  {isDefault
                    ? `Default for ${workspaceName || 'this workspace'}`
                    : `Make default for ${workspaceName || 'this workspace'}`}
                </div>
              </div>
              {isDefault ? (
                <span className="badge-ast shrink-0">
                  ACTIVE
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onSetDefault}
                  className="shrink-0 text-[11px] font-semibold text-blue-500 hover:underline cursor-pointer"
                >
                  Set Default
                </button>
              )}
            </div>
          </div>

          <div className="border border-[var(--seis-border-subtle)] rounded bg-[var(--seis-surface-2)] divide-y divide-[var(--seis-border-subtle)]">
            <StatRow icon={Star} label="Stars" value={repo.stars ?? 0} />
            <StatRow icon={GitFork} label="Forks" value={repo.forks ?? 0} />
            <StatRow icon={repo.visibility === 'private' ? Lock : Globe} label="Visibility" value={repo.visibility ?? 'unknown'} />
            <div className="flex items-center justify-between px-3 py-2 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5 text-[var(--seis-text-muted)]">
                <Sparkles size={12} className="text-blue-500" aria-hidden="true" />
                AST Index Status
              </span>
              <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
                repo.ingestionStatus === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                  : repo.ingestionStatus === 'processing'
                    ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                    : 'bg-[var(--seis-surface-3)] text-[var(--seis-text-muted)]'
              }`}>
                {repo.ingestionStatus === 'completed'
                  ? 'PARSED & INDEXED'
                  : repo.ingestionStatus === 'processing'
                    ? 'PROCESSING…'
                    : 'UNINDEXED'}
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
    <div className="flex items-center justify-between px-3 py-2 font-mono text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 text-[var(--seis-text-muted)]">
        <Icon size={12} aria-hidden="true" />
        {label}
      </span>
      <span className="font-bold text-[var(--seis-text-primary)]">{value}</span>
    </div>
  );
}
