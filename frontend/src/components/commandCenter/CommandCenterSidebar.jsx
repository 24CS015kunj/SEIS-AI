import React from 'react';
import { LayoutGrid, GitBranch, Boxes, TrendingUp, Sparkles, X } from 'lucide-react';
import { BrandGlyph } from '../common/BrandMark';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutGrid, kind: 'active' },
  { id: 'hotspots', label: 'Software Evolution', icon: TrendingUp, kind: 'anchor' },
  { id: 'insights', label: 'Insights', icon: Sparkles, kind: 'anchor' },
  { id: 'architecture', label: 'Architecture', icon: Boxes, kind: 'anchor' },
  { label: 'Source Control', icon: GitBranch, kind: 'soon' },
];

/**
 * A single nav list, not two competing ones — this directly addresses the
 * Figma audit's "duplicate nav systems" finding. Only Dashboard (this page)
 * and the two in-page anchors (Architecture / Insights) are real
 * destinations; Software Evolution and Source Control have no page yet
 * (Source Control is explicitly out of scope for this task) and are shown
 * as inert, clearly-labeled future destinations rather than dead links.
 */
export default function CommandCenterSidebar({ repository, mobileOpen, onCloseMobile }) {
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
        aria-label="Command Center navigation"
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
            <NavRow key={item.label} item={item} onNavigate={onCloseMobile} />
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

function NavRow({ item, onNavigate }) {
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

  return (
    <a
      href={`#${item.id}`}
      onClick={onNavigate}
      aria-current={item.kind === 'active' ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${
        item.kind === 'active'
          ? 'bg-white/[0.06] text-slate-100 font-semibold'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      }`}
    >
      <Icon size={15} className={item.kind === 'active' ? 'text-blue-400' : 'text-slate-500'} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      {item.kind === 'active' && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />}
    </a>
  );
}
