import React from 'react';
import { GitBranch, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const TYPE_LABEL = { main: 'Default', feature: 'Feature', release: 'Release', hotfix: 'Hotfix' };
const TYPE_COLOR = { main: 'text-blue-400', feature: 'text-violet-400', release: 'text-emerald-400', hotfix: 'text-amber-400' };

export default function BranchRow({ branch }) {
  return (
    <li className="flex items-center gap-3 bg-[#111A2C] border border-[#1E293B] rounded-xl px-3.5 py-3">
      <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
        <GitBranch size={13} className={TYPE_COLOR[branch.type] ?? 'text-slate-400'} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-mono font-semibold text-slate-100 truncate">{branch.name}</span>
          {branch.isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-1.5 py-0.5 shrink-0">
              Current
            </span>
          )}
          <span className="text-[10.5px] text-slate-500 shrink-0">{TYPE_LABEL[branch.type] ?? branch.type}</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-0.5 truncate">{branch.lastCommitMessage} · {branch.lastCommitAt}</p>
      </div>
      <div className="hidden sm:flex items-center gap-2.5 text-[11px] font-mono shrink-0">
        <span className="inline-flex items-center gap-0.5 text-emerald-400">
          <ArrowUpRight size={11} aria-hidden="true" />{branch.ahead}
        </span>
        <span className="inline-flex items-center gap-0.5 text-rose-400">
          <ArrowDownRight size={11} aria-hidden="true" />{branch.behind}
        </span>
      </div>
    </li>
  );
}
