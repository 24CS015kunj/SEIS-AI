import React, { useEffect, useState } from 'react';
import { Menu, GitBranch, Sparkles, ChevronDown, Search } from 'lucide-react';
import RepositorySwitcherPopover from './RepositorySwitcherPopover';
import CommandPalette from './CommandPalette';

const STATUS_STYLES = {
  synced: { label: 'Synced', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  analyzing: { label: 'Analyzing', dot: 'bg-blue-500', text: 'text-blue-600' },
  stale: { label: 'Out of date', dot: 'bg-amber-500', text: 'text-amber-600' },
};

/**
 * Task 80: Command Center shell header featuring an interactive Repository Switcher
 * dropdown popover and a global Command Palette (Ctrl/Cmd + K).
 */
export default function CommandCenterHeader({
  repository,
  repositoryId,
  onOpenMobileNav,
  onOpenCopilot,
}) {
  const [repoSwitcherOpen, setRepoSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const status = STATUS_STYLES[repository.status] ?? STATUS_STYLES.synced;

  // Global Ctrl/Cmd + K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 sm:px-6 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="lg:hidden w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 shrink-0"
          >
            <Menu size={18} aria-hidden="true" />
          </button>

          {/* Repository identity trigger & popover */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setRepoSwitcherOpen((prev) => !prev)}
              aria-expanded={repoSwitcherOpen}
              aria-haspopup="dialog"
              aria-label="Switch active repository"
              className="flex items-center gap-1.5 p-1 -ml-1 rounded-lg text-left hover:bg-slate-100/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 group max-w-full"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-[14px] font-bold text-slate-900 truncate">
                    {repository.owner ? `${repository.owner}/` : ''}{repository.name}
                  </h1>
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 group-hover:text-slate-700 shrink-0 transition-transform duration-150 ${
                      repoSwitcherOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11.5px] font-mono text-slate-500 shrink-0 ml-1">
                    <GitBranch size={11} aria-hidden="true" />
                    {repository.branch}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                    {status.label}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-slate-300">·</span>
                  <span className="hidden sm:inline text-[11px] text-slate-500">{repository.lastUpdated}</span>
                </div>
              </div>
            </button>

            {repoSwitcherOpen && (
              <RepositorySwitcherPopover
                currentRepositoryId={repositoryId}
                onClose={() => setRepoSwitcherOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Command Palette Trigger & Copilot Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Search commands and repositories"
            className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-300 text-[12.5px] transition-colors"
          >
            <Search size={14} className="text-slate-400" aria-hidden="true" />
            <span>Search or command...</span>
            <kbd className="inline-flex items-center text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 ml-1">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Command palette"
            className="md:hidden w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center"
          >
            <Search size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenCopilot}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[13px] font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90"
          >
            <Sparkles size={14} aria-hidden="true" />
            <span className="whitespace-nowrap">Open AI Copilot</span>
          </button>
        </div>
      </header>

      <CommandPalette
        repositoryId={repositoryId}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenCopilot={onOpenCopilot}
        onOpenRepoSwitcher={() => setRepoSwitcherOpen(true)}
      />
    </>
  );
}
