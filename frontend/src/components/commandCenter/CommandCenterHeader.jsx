import React from 'react';
import { Menu, GitBranch, Sparkles } from 'lucide-react';

const STATUS_STYLES = {
  synced: { label: 'Synced', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  analyzing: { label: 'Analyzing', dot: 'bg-amber-400', text: 'text-amber-400' },
  stale: { label: 'Out of date', dot: 'bg-slate-500', text: 'text-slate-400' },
};

/**
 * Exactly one prominent call to action ("Open AI Copilot") — this is the
 * fix for the Figma audit's competing-CTA finding. Everything else in this
 * header is identity/status information, not another action of equal weight.
 */
export default function CommandCenterHeader({ repository, onOpenMobileNav, onOpenCopilot }) {
  const status = STATUS_STYLES[repository.status] ?? STATUS_STYLES.synced;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 sm:px-6 border-b border-[#1E293B] bg-[#0F172A]/95 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="lg:hidden w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 shrink-0"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-[14px] font-bold text-slate-100 truncate">
              {repository.owner}/{repository.name}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11.5px] font-mono text-slate-500 shrink-0">
              <GitBranch size={11} aria-hidden="true" />
              {repository.branch}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </span>
            <span className="hidden sm:inline text-[11px] text-slate-600">·</span>
            <span className="hidden sm:inline text-[11px] text-slate-500">{repository.lastUpdated}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenCopilot}
        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[13px] font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90"
      >
        <Sparkles size={14} aria-hidden="true" />
        <span className="whitespace-nowrap">Open AI Copilot</span>
      </button>
    </header>
  );
}
