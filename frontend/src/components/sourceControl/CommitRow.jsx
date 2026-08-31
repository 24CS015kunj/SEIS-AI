import React from 'react';
import { GitCommitHorizontal } from 'lucide-react';

export default function CommitRow({ commit, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(commit)}
        className="w-full flex items-start gap-3 text-left bg-white border border-slate-200 rounded-xl px-3.5 py-3 shadow-sm hover:bg-slate-50 transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
          <GitCommitHorizontal size={13} className="text-slate-400" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-slate-800 leading-snug m-0 truncate">{commit.message}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] font-mono text-slate-500">
            <span className="text-blue-600">{commit.shortHash}</span>
            <span>{commit.author.name}</span>
            <span>{commit.timestamp}</span>
            <span className="text-slate-400">{commit.branch}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono shrink-0 mt-1">
          <span className="text-emerald-600">+{commit.additions}</span>
          <span className="text-rose-600">-{commit.deletions}</span>
        </div>
      </button>
    </li>
  );
}
