import React from 'react';
import { GitPullRequest, GitMerge, XCircle, MessageSquare } from 'lucide-react';

const STATUS = {
  open: { icon: GitPullRequest, label: 'Open', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  merged: { icon: GitMerge, label: 'Merged', text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  closed: { icon: XCircle, label: 'Closed', text: 'text-slate-400', bg: 'bg-white/5', border: 'border-[#1E293B]' },
};

/**
 * Every row is a real, clickable entry point into a detail panel — fixing
 * the Figma audit's "dead-end Pull-Requests/Issues metrics" finding, where
 * PR counts were shown with no way to see what they actually were.
 */
export default function PullRequestRow({ pr, onOpen }) {
  const s = STATUS[pr.status] ?? STATUS.open;
  const Icon = s.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(pr)}
        className="w-full flex items-start gap-3 text-left bg-[#111A2C] border border-[#1E293B] rounded-xl px-3.5 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${s.bg}`}>
          <Icon size={13} className={s.text} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-slate-200 font-medium truncate">{pr.title}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0 ${s.text} ${s.bg} ${s.border}`}>
              {s.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] font-mono text-slate-500">
            <span>#{pr.number}</span>
            <span>{pr.author.name}</span>
            <span>{pr.branch} → {pr.targetBranch}</span>
            <span>{pr.updatedAt}</span>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 shrink-0 mt-1">
          <MessageSquare size={11} aria-hidden="true" />
          {pr.comments}
        </span>
      </button>
    </li>
  );
}
