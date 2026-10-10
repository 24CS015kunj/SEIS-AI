import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { GitBranch, X, LogOut, Layers } from 'lucide-react';
import { BrandGlyph } from '../common/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { getActiveWorkspace } from '../../services/workspaceService';
import { APP_NAV_ITEMS } from '../layout/appNavItems';

/**
 * Shared authenticated sidebar — workspace dashboard, repository-scoped
 * product pages, and Insights (Command Center + #insights).
 */
export default function CommandCenterSidebar({ repository, repositoryId, mobileOpen, onCloseMobile }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const activeWorkspace = getActiveWorkspace();
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] shrink-0 bg-[var(--seis-surface-1)] border-r border-[var(--seis-border-subtle)] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Application navigation"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-13 border-b border-[var(--seis-border-subtle)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <BrandGlyph size={14} tone="onLight" />
            </div>
            <span className="text-[13px] font-bold text-[var(--seis-text-primary)] truncate font-mono tracking-tight">SEIS-AI</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden w-7 h-7 rounded-md flex items-center justify-center text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] hover:bg-[var(--seis-surface-hover)] transition-colors"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="px-3.5 py-2.5 border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--seis-text-muted)]">Workspace</span>
            <Link
              to="/workspace"
              className="text-[11px] font-mono font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Switch
            </Link>
          </div>
          <div
            className="flex items-center gap-1.5 mt-1 text-[12.5px] font-semibold text-[var(--seis-text-primary)] truncate"
            title={activeWorkspace?.name || 'My Workspace'}
          >
            <Layers size={13} className="text-blue-600 shrink-0" />
            <span className="truncate">{activeWorkspace?.name || 'My Workspace'}</span>
          </div>
        </div>

        {repositoryId ? (
          <div className="px-3.5 py-2.5 border-b border-[var(--seis-border-subtle)]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-0.5">Active Repository</div>
            <div className="text-[12.5px] font-bold text-[var(--seis-text-primary)] truncate font-mono">{repository.name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--seis-text-secondary)] mt-0.5 truncate font-mono">
              <GitBranch size={10} className="shrink-0" />
              <span>{repository.branch}</span>
              <span className="text-[var(--seis-text-muted)]">·</span>
              <span className="truncate">{repository.owner}</span>
            </div>
          </div>
        ) : (
          <div className="px-3.5 py-2.5 border-b border-[var(--seis-border-subtle)]">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-0.5">Active Repository</div>
            <p className="text-[12px] text-[var(--seis-text-muted)] m-0 mb-1.5">None selected</p>
            <div className="flex flex-col gap-1">
              <Link to="/command-center" className="text-[11px] font-semibold text-blue-600 hover:underline">
                Open Overview
              </Link>
              <Link to="/import-repository" className="text-[11px] font-semibold text-blue-600 hover:underline">
                Import Repository
              </Link>
            </div>
          </div>
        )}

        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {APP_NAV_ITEMS.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              currentPath={location.pathname}
              repositoryId={repositoryId}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>

        <div className="px-3.5 py-2.5 border-t border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              AST Index Active
            </span>
            {user && (
              <div className="text-[11px] font-mono text-[var(--seis-text-muted)] truncate mt-0.5" title={user.githubUsername}>
                @{user.githubUsername}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[var(--seis-text-secondary)] hover:text-rose-600 hover:bg-[var(--seis-surface-hover)] transition-colors cursor-pointer"
          >
            <LogOut size={13} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}

function NavRow({ item, currentPath, repositoryId, onNavigate }) {
  const Icon = item.icon;

  const onItemRoute =
    currentPath === item.page || currentPath.startsWith(`${item.page}/`);
  const isActive = Boolean(item.primary && onItemRoute);

  const scopedBase = repositoryId ? `${item.page}/${repositoryId}` : item.page;
  const href = item.hash ? `${scopedBase}#${item.hash}` : scopedBase;

  return (
    <Link
      to={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[12.5px] font-medium transition-all ${
        isActive
          ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 font-semibold border border-blue-200/70 dark:border-blue-500/30 shadow-2xs'
          : 'text-[var(--seis-text-secondary)] hover:bg-[var(--seis-surface-hover)] hover:text-[var(--seis-text-primary)] border border-transparent'
      }`}
    >
      <Icon size={14} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--seis-text-muted)]'} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" aria-hidden="true" />}
    </Link>
  );
}
