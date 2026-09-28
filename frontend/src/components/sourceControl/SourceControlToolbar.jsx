import React from 'react';
import { GitCommitHorizontal, GitBranch, GitPullRequest, Folder } from 'lucide-react';

const TABS = [
  { id: 'commits', label: 'Commits', icon: GitCommitHorizontal },
  { id: 'branches', label: 'Branches', icon: GitBranch },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'pullRequests', label: 'Pull Requests', icon: GitPullRequest },
];

export default function SourceControlToolbar({
  activeTab,
  onTabChange,
  counts,
  branches,
  branchFilter,
  onBranchFilterChange,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div role="tablist" aria-label="Source control views" className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {tab.label}
              <span className="tabular-nums text-slate-400">
                {counts[tab.id] == null ? '—' : counts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {(activeTab === 'commits' || activeTab === 'files') && (
        <div className="flex items-center gap-2">
          <label htmlFor="branch-filter" className="text-[11.5px] text-slate-500 shrink-0">
            Branch
          </label>
          <select
            id="branch-filter"
            value={branchFilter}
            onChange={(e) => onBranchFilterChange(e.target.value)}
            className="h-8 px-2.5 rounded-md bg-white border border-slate-200 text-[12.5px] text-slate-900 focus-visible:border-blue-500"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              // Real Branch documents key on Mongo `_id`, not `id` (Task 57).
              <option key={b._id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
