import React from 'react';
import { Boxes, FileCode2, Languages, GitBranch as DependencyIcon } from 'lucide-react';

/**
 * Real overview metrics for the Architecture page (Task 69) -- reuses
 * exactly the fields the existing `GET .../dashboard` endpoint (Task 68)
 * already computes from real synced/GitHub data. `dependenciesAvailable`
 * is deliberately never a count here -- this codebase has no
 * dependency-*graph* engine (only a manifest dependency *count*, a
 * different fact, already shown on the Dashboard itself), so this card
 * only ever says whether relationship analysis exists, never a number.
 */
export default function ArchitectureOverviewCards({ moduleCount, fileCount, languages, dependenciesAvailable }) {
  const cards = [
    { key: 'modules', label: 'Modules', value: moduleCount, icon: Boxes, iconWash: 'bg-blue-50', color: 'text-blue-600' },
    { key: 'files', label: 'Files', value: fileCount, icon: FileCode2, iconWash: 'bg-blue-50', color: 'text-blue-600' },
    {
      key: 'languages',
      label: 'Languages',
      value: languages.length > 0 ? languages.length : null,
      hint: languages.length > 0 ? languages.slice(0, 3).map((l) => l.name).join(', ') : null,
      icon: Languages,
      iconWash: 'bg-emerald-50',
      color: 'text-emerald-600',
    },
    {
      key: 'dependencies',
      label: 'Dependency Analysis',
      value: dependenciesAvailable ? 'Available' : 'Not available',
      isText: true,
      icon: DependencyIcon,
      iconWash: dependenciesAvailable ? 'bg-emerald-50' : 'bg-slate-100',
      color: dependenciesAvailable ? 'text-emerald-600' : 'text-slate-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-6 h-6 rounded-md ${c.iconWash} flex items-center justify-center shrink-0`}>
              <c.icon size={13} className={c.color} aria-hidden="true" />
            </span>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{c.label}</span>
          </div>
          <div
            className={`font-mono tabular-nums ${
              c.value == null
                ? 'text-[14px] font-semibold text-slate-400'
                : c.isText
                  ? 'text-[15px] font-bold text-slate-900'
                  : 'text-[22px] font-bold text-slate-900'
            }`}
          >
            {c.value == null ? 'Not available' : c.value}
          </div>
          {c.hint && <p className="text-[11px] text-slate-500 mt-1 m-0 truncate">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}
