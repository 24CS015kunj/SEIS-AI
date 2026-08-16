import React from 'react';
import { GitCommitHorizontal, GitBranch, GitPullRequest } from 'lucide-react';

const TABS = [
  { id: 'commits', label: 'Commits', icon: GitCommitHorizontal },
  { id: 'branches', label: 'Branches', icon: GitBranch },
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
      <div role="tablist" aria-label="Source control views" className="flex items-center gap-1 bg-[#111A2C] border border-[#1E293B] rounded-lg p-1 w-fit max-w-full overflow-x-auto">
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
                active ? 'bg-white/[0.08] text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {tab.label}
              <span className={`tabular-nums ${active ? 'text-slate-400' : 'text-slate-600'}`}>{counts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'commits' && (
        <div className="flex items-center gap-2">
          <label htmlFor="branch-filter" className="text-[11.5px] text-slate-500 shrink-0">
            Branch
          </label>
          <select
            id="branch-filter"
            value={branchFilter}
            onChange={(e) => onBranchFilterChange(e.target.value)}
            className="h-8 px-2.5 rounded-md bg-[#111A2C] border border-[#1E293B] text-[12.5px] text-slate-200 focus-visible:border-blue-500"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
