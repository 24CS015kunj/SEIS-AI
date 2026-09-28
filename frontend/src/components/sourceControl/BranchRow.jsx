import React from 'react';
import { GitBranch } from 'lucide-react';

const TYPE_LABEL = { main: 'Default', branch: 'Branch' };
const TYPE_COLOR = { main: 'text-blue-600', branch: 'text-slate-400' };

/**
 * Task 57: real `Branch` documents have no ahead/behind-vs-default
 * tracking (that requires a GitHub compare call this backend doesn't
 * make) and no last-commit message/date on the branch record itself
 * (only `latestCommitSha`) -- so neither is fabricated here. The
 * ahead/behind badges from the mock version are gone entirely rather
 * than showing invented zeros; the subtitle falls back to the real
 * commit SHA instead of a message/date pair this data doesn't have.
 */
export default function BranchRow({ branch }) {
  const type = branch.isDefault ? 'main' : 'branch';
  const subtitle =
    branch.lastCommitMessage && branch.lastCommitAt
      ? `${branch.lastCommitMessage} · ${branch.lastCommitAt}`
      : branch.latestCommitSha
        ? `Latest commit ${branch.latestCommitSha.slice(0, 7)}`
        : 'No commits synced yet';

  return (
    <li className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-3.5 py-3">
      <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <GitBranch size={13} className={TYPE_COLOR[type]} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-mono font-semibold text-slate-900 truncate">{branch.name}</span>
          {branch.isDefault && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-1.5 py-0.5 shrink-0">
              Current
            </span>
          )}
          <span className="text-[10.5px] text-slate-500 shrink-0">{TYPE_LABEL[type]}</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
      </div>
    </li>
  );
}
