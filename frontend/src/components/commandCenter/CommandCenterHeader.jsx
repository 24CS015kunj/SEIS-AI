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
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-13 px-4 sm:px-6 border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)]">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="lg:hidden w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] hover:bg-[var(--seis-surface-hover)] shrink-0 transition-colors"
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
              className="flex items-center gap-2 px-2 py-1 -ml-1 rounded-md text-left hover:bg-[var(--seis-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 group max-w-full"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-[13.5px] font-bold text-[var(--seis-text-primary)] truncate">
                    {repository.owner ? `${repository.owner}/` : ''}{repository.name}
                  </h1>
                  <ChevronDown
                    size={12}
                    className={`text-[var(--seis-text-muted)] group-hover:text-[var(--seis-text-primary)] shrink-0 transition-transform duration-150 ${
                      repoSwitcherOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-mono text-[var(--seis-text-secondary)] bg-[var(--seis-surface-2)] border border-[var(--seis-border-subtle)] px-1.5 py-0.5 rounded shrink-0 ml-1">
                    <GitBranch size={10} aria-hidden="true" />
                    {repository.branch}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                    {status.label}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-[var(--seis-text-muted)]">·</span>
                  <span className="hidden sm:inline text-[11px] font-mono text-[var(--seis-text-muted)]">{repository.lastUpdated}</span>
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
            className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--seis-surface-2)] hover:bg-[var(--seis-surface-hover)] border border-[var(--seis-border-subtle)] text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] text-[12px] font-mono transition-all cursor-pointer"
          >
            <Search size={12} className="text-[var(--seis-text-muted)]" aria-hidden="true" />
            <span>Search repository...</span>
            <kbd className="ml-1 text-[10px] font-mono font-semibold text-[var(--seis-text-primary)] bg-[var(--seis-surface-1)] rounded px-1.5 py-0.2 border border-[var(--seis-border-strong)]">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Command palette"
            className="md:hidden w-8 h-8 rounded-md bg-[var(--seis-surface-2)] border border-[var(--seis-border-subtle)] text-[var(--seis-text-secondary)] flex items-center justify-center hover:bg-[var(--seis-surface-hover)]"
          >
            <Search size={13} aria-hidden="true" />
          </button>

          <ThemeToggle />

          <button
            type="button"
            onClick={onOpenCopilot}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold border-0 cursor-pointer transition-colors shadow-2xs"
          >
            <Sparkles size={12} aria-hidden="true" />
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

