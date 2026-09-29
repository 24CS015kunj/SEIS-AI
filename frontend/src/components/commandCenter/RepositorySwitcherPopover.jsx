import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Check, FolderGit2, Loader2, AlertCircle, X, Plus } from 'lucide-react';
import { listRepositories } from '../../services/repositoryService';
import { buildRepositorySwitchPath } from '../../utils/navigationUtils';
import {
  getActiveWorkspace,
  getDefaultRepositoryForWorkspace,
  setDefaultRepositoryForWorkspace,
} from '../../services/workspaceService';

export default function RepositorySwitcherPopover({ currentRepositoryId, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [repos, setRepos] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    listRepositories()
      .then((data) => {
        if (cancelled) return;
        setRepos(data || []);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setError(err.response?.data?.message || 'Failed to load repositories.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Focus search input on open
    searchInputRef.current?.focus();
  }, [status]);

  const filteredRepos = useMemo(() => {
    if (!query.trim()) return repos;
    const q = query.toLowerCase().trim();
    return repos.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.owner && r.owner.toLowerCase().includes(q))
    );
  }, [repos, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const activeWs = useMemo(() => getActiveWorkspace(), []);
  const defaultRepoId = useMemo(() => {
    return activeWs?._id ? getDefaultRepositoryForWorkspace(activeWs._id) : null;
  }, [activeWs]);

  const handleSelectRepo = (targetRepoId) => {
    if (activeWs?._id && targetRepoId) {
      const targetRepo = repos.find((r) => r._id === targetRepoId);
      setDefaultRepositoryForWorkspace(
        activeWs._id,
        targetRepoId,
        targetRepo?.fullName || targetRepo?.name
      );
    }
    const targetPath = buildRepositorySwitchPath(location.pathname, targetRepoId);
    onClose();
    navigate(targetPath);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredRepos.length > 0 ? (prev + 1) % filteredRepos.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredRepos.length > 0 ? (prev - 1 + filteredRepos.length) % filteredRepos.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredRepos[selectedIndex]) {
        handleSelectRepo(filteredRepos[selectedIndex]._id);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="dialog"
      aria-label="Repository switcher"
      className="absolute top-full left-0 mt-1.5 w-80 sm:w-96 rounded-xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden flex flex-col focus:outline-none"
    >
      <div className="p-2.5 border-b border-slate-100 flex items-center gap-2">
        <Search size={15} className="text-slate-400 shrink-0 ml-1" aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter repositories..."
          className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 border-0 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Clear search"
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto p-1.5">
        {status === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-slate-400">
            <Loader2 size={16} className="animate-spin text-blue-600" aria-hidden="true" />
            Loading repositories...
          </div>
        ) : status === 'error' ? (
          <div className="flex items-center gap-2 p-3 text-[12.5px] text-rose-600 bg-rose-50 rounded-lg">
            <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
            <span>{error || 'Failed to load repositories.'}</span>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-slate-400">
            No repositories found matching "{query}"
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filteredRepos.map((repo, idx) => {
              const isCurrent = repo._id === currentRepositoryId;
              const isDefault = repo._id === defaultRepoId;
              const isFocused = idx === selectedIndex;
              return (
                <li key={repo._id}>
                  <button
                    type="button"
                    onClick={() => handleSelectRepo(repo._id)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-50/70 text-blue-900 font-medium'
                        : isFocused
                        ? 'bg-slate-100/80 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FolderGit2
                        size={15}
                        className={isCurrent ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold truncate leading-snug">
                            {repo.name}
                          </span>
                          {isDefault && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded px-1.5 py-0.2 shrink-0">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {repo.owner || 'GitHub'} · {repo.defaultBranch || 'main'}
                        </div>
                      </div>
                    </div>
                    {isCurrent && (
                      <Check size={15} className="text-blue-600 shrink-0 ml-auto" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="p-2 border-t border-slate-100 bg-slate-50/70">
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/import-repository');
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50/80 transition-colors cursor-pointer"
        >
          <Plus size={13} />
          Connect / Import Another Repo
        </button>
      </div>
    </div>
  );
}
