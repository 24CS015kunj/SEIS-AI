import React from 'react';
import { Database, FileCode2, Users, GitCommit, GitBranch, Layers } from 'lucide-react';

export default function RepositorySnapshot({ dashboardData }) {
  const files = dashboardData?.files?.fileCount || 0;
  const contributors = dashboardData?.contributors?.total || 0;
  const languages = dashboardData?.languages?.breakdown?.length || 0;
  const commits = dashboardData?.activity?.commits?.length || 0;
  const modules = dashboardData?.architecture?.directories?.length || 0;

  return (
    <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Database size={18} className="text-slate-700 dark:text-slate-300" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Repository Snapshot</h2>
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-2">
        <SnapshotItem icon={FileCode2} label="Files" value={files} />
        <SnapshotItem icon={Users} label="Contributors" value={contributors} />
        <SnapshotItem icon={Layers} label="Languages" value={languages} />
        <SnapshotItem icon={GitCommit} label="Commits" value={commits} />
        <SnapshotItem icon={GitBranch} label="Modules" value={modules} />
      </div>
    </div>
  );
}

function SnapshotItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
        <Icon size={14} />
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value || 'N/A'}</div>
        <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">{label}</div>
      </div>
    </div>
  );
}
