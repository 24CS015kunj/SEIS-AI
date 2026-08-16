import React from 'react';
import { GitCommitHorizontal } from 'lucide-react';

export default function CommitRow({ commit, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(commit)}
        className="w-full flex items-start gap-3 text-left bg-[#111A2C] border border-[#1E293B] rounded-xl px-3.5 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
          <GitCommitHorizontal size={13} className="text-slate-400" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-slate-200 leading-snug m-0 truncate">{commit.message}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] font-mono text-slate-500">
            <span className="text-blue-400">{commit.shortHash}</span>
            <span>{commit.author.name}</span>
            <span>{commit.timestamp}</span>
            <span className="text-slate-600">{commit.branch}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono shrink-0 mt-1">
          <span className="text-emerald-400">+{commit.additions}</span>
          <span className="text-rose-400">-{commit.deletions}</span>
        </div>
      </button>
    </li>
  );
}
