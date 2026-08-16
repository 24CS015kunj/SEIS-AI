import React from 'react';
import { GitPullRequest, GitMerge, XCircle, MessageSquare } from 'lucide-react';
import DetailDrawer from './DetailDrawer';

const STATUS = {
  open: { icon: GitPullRequest, label: 'Open', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  merged: { icon: GitMerge, label: 'Merged', text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  closed: { icon: XCircle, label: 'Closed', text: 'text-slate-400', bg: 'bg-white/5', border: 'border-[#1E293B]' },
};

export default function PullRequestDetailDrawer({ pr, onClose }) {
  const s = STATUS[pr.status] ?? STATUS.open;
  const Icon = s.icon;

  return (
    <DetailDrawer titleId="pr-drawer-title" title={`#${pr.number}`} icon={GitPullRequest} onClose={onClose}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${s.text} ${s.bg} ${s.border}`}>
          <Icon size={10} aria-hidden="true" />
          {s.label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500">
          <MessageSquare size={11} aria-hidden="true" />
          {pr.comments} comments
        </span>
      </div>

      <p className="text-[14.5px] font-semibold text-slate-100 leading-snug mb-3">{pr.title}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-400 mb-5">
        <span>{pr.author.name}</span>
        <span className="font-mono text-slate-500">{pr.branch} → {pr.targetBranch}</span>
        <span>{pr.updatedAt}</span>
      </div>

      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">Description</span>
      <p className="text-[13px] text-slate-300 leading-relaxed bg-[#111A2C] border border-[#1E293B] rounded-lg px-3.5 py-3">
        {pr.description}
      </p>
    </DetailDrawer>
  );
}
