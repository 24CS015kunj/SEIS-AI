import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { LayoutGrid, GitBranch, Boxes, TrendingUp, Sparkles, X, LogOut } from 'lucide-react';
import { BrandGlyph } from '../common/BrandMark';
import { useAuth } from '../../context/AuthContext';

/**
 * `page` distinguishes the real destinations this shared shell nav can
 * point at; `anchor` items only make sense once on the Command Center
 * page itself. Task 69: "Architecture" used to be an anchor into a small
 * Dashboard section, which live testing found read as "an effectively
 * empty page" -- it now points at its own real, dedicated route
 * (`/architecture`), same `primary` treatment as Dashboard/Source
 * Control. "Insights" stays an anchor -- AI Insights (Task 69's real
 * analysis) genuinely lives on the Dashboard, not a separate page.
 * Task 79: "Software Evolution" now points at its own real, dedicated
 * route the same way -- the "Soon" placeholder is retired now that a
 * real page exists behind it.
 */
const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutGrid, page: '/command-center', anchor: true, primary: true },
  { label: 'Architecture', icon: Boxes, page: '/architecture', primary: true },
  { id: 'insights', label: 'Insights', icon: Sparkles, page: '/command-center', anchor: true },
  { label: 'Software Evolution', icon: TrendingUp, page: '/software-evolution', primary: true },
  { label: 'Source Control', icon: GitBranch, page: '/source-control', primary: true },
];

/**
 * Shared app-shell navigation used by both Command Center and Source
 * Control — a single nav list, not two competing ones, which directly
 * addresses the Figma audit's "duplicate nav systems" finding. Active state
 * is derived from the current route rather than hardcoded, so the same
 * component works correctly on either page. Software Evolution has no page
 * yet and stays inert with a "Soon" tag rather than a dead link.
 *
 * Task 71: navigation is now driven entirely by `repositoryId` (the real
 * Mongo `_id`, resolved from the URL by the page via `useRepositoryIdentity`)
 * instead of React Router `location.state`. Every link this component
 * builds appends `repositoryId` onto the target path itself
 * (`/architecture/<id>`), so the selected repository survives every
 * in-app navigation, a refresh, and a direct/pasted link -- state never
 * enters the picture. `repositoryId` is `null`/`undefined` exactly when no
 * repository is selected (the honest state), and every link then points
 * at the bare, repository-less route.
 */
export default function CommandCenterSidebar({ repository, repositoryId, mobileOpen, onCloseMobile }) {
  const location = useLocation();
  const { user, logout } = useAuth();
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
        className={`fixed inset-y-0 left-0 z-50 w-[248px] shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Application navigation"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <BrandGlyph size={16} tone="onLight" />
            </div>
            <span className="text-[13px] font-bold text-slate-900 truncate">SEIS AI Copilot</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-slate-200">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Active Repository
          </div>
          <div className="text-[13.5px] font-semibold text-slate-900 truncate">{repository.name}</div>
          <div className="text-[11.5px] font-mono text-slate-500 mt-0.5 truncate">
            {repository.branch} · {repository.owner}
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavRow
              key={item.label}
              item={item}
              currentPath={location.pathname}
              repositoryId={repositoryId}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-slate-200 shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              AST Index Ready
            </span>
            {user && (
              <div className="text-[11px] text-slate-500 truncate mt-1" title={user.githubUsername}>
                {user.githubUsername}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50"
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}

function NavRow({ item, currentPath, repositoryId, onNavigate }) {
  const Icon = item.icon;

  if (item.kind === 'soon') {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-400 cursor-not-allowed">
        <Icon size={15} className="text-slate-400 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">
          Soon
        </span>
      </div>
    );
  }

  // A route now optionally carries `/<repositoryId>` on the end -- "on
  // this page" means the current path is either the bare page route or
  // that route plus any repository id, not an exact string match.
  const onCurrentPage = currentPath === item.page || currentPath.startsWith(`${item.page}/`);
  const target = repositoryId ? `${item.page}/${repositoryId}` : item.page;
  // An anchor only behaves like an in-page anchor while already on its
  // page (native browser hash-scroll, zero JS); from elsewhere it's a
  // real cross-page navigation to that page (+ repository id) + hash.
  const href = item.anchor && onCurrentPage ? `#${item.id}` : `${target}${item.anchor ? `#${item.id}` : ''}`;
  const isActive = onCurrentPage && item.primary;
  const Tag = item.anchor && onCurrentPage ? 'a' : Link;
  const linkProp = Tag === 'a' ? { href } : { to: href };

  return (
    <Tag
      {...linkProp}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-semibold'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={15} className={isActive ? 'text-blue-600' : 'text-slate-400'} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" aria-hidden="true" />}
    </Tag>
  );
}
