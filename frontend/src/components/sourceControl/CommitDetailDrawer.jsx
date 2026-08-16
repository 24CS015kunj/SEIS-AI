import React from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import DetailDrawer from './DetailDrawer';

export default function CommitDetailDrawer({ commit, onClose }) {
  return (
    <DetailDrawer titleId="commit-drawer-title" title={commit.shortHash} icon={GitCommitHorizontal} onClose={onClose}>
      <p className="text-[14.5px] font-semibold text-slate-100 leading-snug mb-3">{commit.message}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-400 mb-5">
        <span>{commit.author.name}</span>
        <span>{commit.timestamp}</span>
        <span className="font-mono text-slate-500">{commit.branch}</span>
      </div>

      <div className="flex items-center gap-4 text-[12.5px] font-mono mb-5">
        <span className="text-emerald-400">+{commit.additions} additions</span>
        <span className="text-rose-400">-{commit.deletions} deletions</span>
      </div>

      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        {commit.filesChanged} file{commit.filesChanged === 1 ? '' : 's'} changed
      </span>
      <ul className="flex flex-col gap-1.5">
        {commit.files.map((f) => (
          <li key={f.path} className="flex items-center justify-between gap-3 bg-[#111A2C] border border-[#1E293B] rounded-lg px-3 py-2">
            <span className="text-[12px] font-mono text-slate-300 truncate">{f.path}</span>
            <span className="text-[11px] font-mono shrink-0">
              <span className="text-emerald-400">+{f.additions}</span>{' '}
              <span className="text-rose-400">-{f.deletions}</span>
            </span>
          </li>
        ))}
      </ul>
    </DetailDrawer>
  );
}
