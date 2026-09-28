import React, { useEffect, useState } from 'react';
import { Menu, GitBranch, Sparkles, ChevronDown, Search } from 'lucide-react';
import RepositorySwitcherPopover from './RepositorySwitcherPopover';
import CommandPalette from './CommandPalette';
import ThemeToggle from '../common/ThemeToggle';

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
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 sm:px-6 border-b border-black/[0.06] liquid-glass">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="lg:hidden w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.05] shrink-0 transition-colors"
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
              className="flex items-center gap-2 px-2.5 py-1.5 -ml-1.5 rounded-xl text-left hover:bg-black/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 group max-w-full"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-[14px] font-semibold text-[#1D1D1F] truncate">
                    {repository.owner ? `${repository.owner}/` : ''}{repository.name}
                  </h1>
                  <ChevronDown
                    size={13}
                    className={`text-[#86868B] group-hover:text-[#1D1D1F] shrink-0 transition-transform duration-150 ${
                      repoSwitcherOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-[#86868B] bg-black/[0.04] px-2 py-0.5 rounded-full shrink-0 ml-1">
                    <GitBranch size={10} aria-hidden="true" />
                    {repository.branch}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                    {status.label}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-black/20">·</span>
                  <span className="hidden sm:inline text-[11.5px] text-[#86868B]">{repository.lastUpdated}</span>
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
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Search commands and repositories"
            className="hidden md:inline-flex items-center gap-2.5 h-9 px-3.5 rounded-full bg-black/[0.05] hover:bg-black/[0.08] text-[#86868B] hover:text-[#1D1D1F] text-[13px] font-normal transition-all cursor-pointer"
          >
            <Search size={13} className="text-[#86868B]" aria-hidden="true" />
            <span>Search or command...</span>
            <kbd className="ml-1 text-[11px] font-medium text-[#1D1D1F] bg-white rounded-md px-1.5 py-0.5 shadow-xs border border-black/[0.06]">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Command palette"
            className="md:hidden w-8 h-8 rounded-full bg-black/[0.05] text-[#86868B] flex items-center justify-center hover:bg-black/[0.08]"
          >
            <Search size={14} aria-hidden="true" />
          </button>

          <ThemeToggle />

          <button
            type="button"
            onClick={onOpenCopilot}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white text-[13px] font-medium shadow-[0_2px_8px_rgba(0,113,227,0.3)] cursor-pointer transition-all active:scale-[0.97]"
          >
            <Sparkles size={13} aria-hidden="true" />
            <span className="whitespace-nowrap">AI Copilot</span>
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

