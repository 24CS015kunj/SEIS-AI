import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  LayoutGrid,
  Boxes,
  GitBranch,
  TrendingUp,
  Sparkles,
  FolderGit2,
  X,
  ArrowRight,
} from 'lucide-react';
import { listRepositories } from '../../services/repositoryService';
import { buildRepositorySwitchPath } from '../../utils/navigationUtils';

export default function CommandPalette({
  repositoryId,
  isOpen,
  onClose,
  onOpenCopilot,
  onOpenRepoSwitcher,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [repos, setRepos] = useState([]);

  const inputRef = useRef(null);

  // Fetch real repositories once opened
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    let cancelled = false;
    listRepositories()
      .then((data) => {
        if (cancelled) return;
        setRepos(data || []);
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Static navigation and action items
  const baseItems = useMemo(() => {
    const target = (base) => (repositoryId ? `${base}/${repositoryId}` : base);
    return [
      {
        id: 'nav-dashboard',
        category: 'Navigation',
        label: 'Go to Dashboard',
        icon: LayoutGrid,
        perform: () => navigate(target('/command-center')),
      },
      {
        id: 'nav-architecture',
        category: 'Navigation',
        label: 'Go to Architecture',
        icon: Boxes,
        perform: () => navigate(target('/architecture')),
      },
      {
        id: 'nav-software-evolution',
        category: 'Navigation',
        label: 'Go to Software Evolution',
        icon: TrendingUp,
        perform: () => navigate(target('/software-evolution')),
      },
      {
        id: 'nav-source-control',
        category: 'Navigation',
        label: 'Go to Source Control',
        icon: GitBranch,
        perform: () => navigate(target('/source-control')),
      },
      {
        id: 'nav-insights',
        category: 'Navigation',
        label: 'Go to AI Insights',
        icon: Sparkles,
        perform: () => navigate(`${target('/command-center')}#insights`),
      },
      {
        id: 'action-copilot',
        category: 'Actions',
        label: 'Open AI Copilot',
        icon: Sparkles,
        perform: () => onOpenCopilot?.(),
      },
      {
        id: 'action-switch-repo',
        category: 'Actions',
        label: 'Switch Repository',
        icon: FolderGit2,
        perform: () => onOpenRepoSwitcher?.(),
      },
    ];
  }, [repositoryId, navigate, onOpenCopilot, onOpenRepoSwitcher, onOpenSemanticSearch]);

  // Dynamic repository items
  const repoItems = useMemo(() => {
    return repos.map((repo) => ({
      id: `repo-${repo._id}`,
      category: 'Repositories',
      label: `${repo.owner ? `${repo.owner}/` : ''}${repo.name}`,
      detail: repo.defaultBranch ? `Branch: ${repo.defaultBranch}` : undefined,
      icon: FolderGit2,
      isCurrent: repo._id === repositoryId,
      perform: () => {
        const switchPath = buildRepositorySwitchPath(location.pathname, repo._id);
        navigate(switchPath);
      },
    }));
  }, [repos, repositoryId, location.pathname, navigate]);

  // Combine and filter items based on user query
  const allFilteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filteredBase = baseItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
    const filteredRepos = repoItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
    return [...filteredBase, ...filteredRepos];
  }, [baseItems, repoItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allFilteredItems.length > 0 ? (prev + 1) % allFilteredItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        allFilteredItems.length > 0 ? (prev - 1 + allFilteredItems.length) % allFilteredItems.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allFilteredItems[selectedIndex];
      if (item) {
        onClose();
        item.perform();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col focus:outline-none animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search size={18} className="text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search repositories..."
            className="flex-1 bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 border-0 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Clear query"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center text-[10.5px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-[360px] overflow-y-auto p-2">
          {allFilteredItems.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate-400">
              No matching commands or repositories found for "{query}"
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {allFilteredItems.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      item.perform();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        size={16}
                        className={isSelected ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <span className="text-[13px] leading-snug truncate block">{item.label}</span>
                        {item.detail && (
                          <span className="text-[11px] text-slate-400 truncate block">
                            {item.detail}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.category}
                      </span>
                      {isSelected && (
                        <ArrowRight size={13} className="text-blue-600" aria-hidden="true" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-white border border-slate-200 rounded px-1 text-[10px]">↑</kbd>{' '}
              <kbd className="bg-white border border-slate-200 rounded px-1 text-[10px]">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="bg-white border border-slate-200 rounded px-1 text-[10px]">↵</kbd> to select
            </span>
          </div>
          <span>SEIS AI Engineering Intelligence</span>
        </div>
      </div>
    </div>
  );
}
