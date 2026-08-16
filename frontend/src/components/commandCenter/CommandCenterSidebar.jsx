import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { LayoutGrid, GitBranch, Boxes, TrendingUp, Sparkles, X } from 'lucide-react';
import { BrandGlyph } from '../common/BrandMark';

/**
 * `page` distinguishes the two real destinations this shared shell nav can
 * point at today; `anchor` items only make sense once on the Command
 * Center page itself.
 */
const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutGrid, page: '/command-center', anchor: true, primary: true },
  { id: 'architecture', label: 'Architecture', icon: Boxes, page: '/command-center', anchor: true },
  { id: 'insights', label: 'Insights', icon: Sparkles, page: '/command-center', anchor: true },
  { label: 'Software Evolution', icon: TrendingUp, kind: 'soon' },
  { label: 'Source Control', icon: GitBranch, page: '/source-control', primary: true },
];

/**
 * Shared app-shell navigation used by both Command Center and Source
 * Control — a single nav list, not two competing ones, which directly
 * addresses the Figma audit's "duplicate nav systems" finding. Active state
 * is derived from the current route rather than hardcoded, so the same
 * component works correctly on either page. Software Evolution has no page
 * yet and stays inert with a "Soon" tag rather than a dead link.
 */
export default function CommandCenterSidebar({ repository, mobileOpen, onCloseMobile }) {
  const location = useLocation();
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
        className={`fixed inset-y-0 left-0 z-50 w-[248px] shrink-0 bg-[#0B1220] border-r border-[#1E293B] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Application navigation"
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <BrandGlyph size={16} tone="onDark" />
            </div>
            <span className="text-[13px] font-bold text-slate-100 truncate">SEIS AI Copilot</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="lg:hidden w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-[#1E293B]">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Active Repository
          </div>
          <div className="text-[13.5px] font-semibold text-slate-100 truncate">{repository.name}</div>
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
              repository={repository}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-[#1E293B] shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            AST Index Ready
          </span>
        </div>
      </aside>
    </>
  );
}

function NavRow({ item, currentPath, repository, onNavigate }) {
  const Icon = item.icon;

  if (item.kind === 'soon') {
    return (
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-600 cursor-not-allowed">
        <Icon size={15} className="text-slate-700 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-600 bg-white/5 rounded-full px-1.5 py-0.5 shrink-0">
          Soon
        </span>
      </div>
    );
  }

  const onCurrentPage = item.page === currentPath;
  // An anchor only behaves like an in-page anchor while already on its page
  // (native browser hash-scroll, zero JS); from elsewhere it's a real
  // cross-page navigation to that page + hash instead.
  const href = item.anchor && onCurrentPage ? `#${item.id}` : `${item.page}${item.anchor ? `#${item.id}` : ''}`;
  const isActive = onCurrentPage && item.primary;
  const Tag = item.anchor && onCurrentPage ? 'a' : Link;
  const linkProp = Tag === 'a' ? { href } : { to: href, state: { repo: repository } };

  return (
    <Tag
      {...linkProp}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${
        isActive
          ? 'bg-white/[0.06] text-slate-100 font-semibold'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      }`}
    >
      <Icon size={15} className={isActive ? 'text-blue-400' : 'text-slate-500'} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />}
    </Tag>
  );
}
