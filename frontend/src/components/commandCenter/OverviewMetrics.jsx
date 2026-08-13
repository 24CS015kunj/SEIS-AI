import React from 'react';
import { FileCode2, Code2, Package, Users } from 'lucide-react';

function formatCompact(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/**
 * The highest-priority content block on the page (Figma audit hierarchy
 * item #2, "Key engineering overview") — rendered first, before insights
 * or architecture, so the reader gets orientation before detail.
 */
export default function OverviewMetrics({ overview }) {
  const cards = [
    { label: 'Files', value: formatCompact(overview.files), icon: FileCode2, color: 'text-blue-400' },
    { label: 'Lines of Code', value: formatCompact(overview.linesOfCode), icon: Code2, color: 'text-indigo-400' },
    { label: 'Dependencies', value: String(overview.dependencies), icon: Package, color: 'text-violet-400' },
    { label: 'Contributors', value: String(overview.contributors), icon: Users, color: 'text-emerald-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <c.icon size={14} className={c.color} aria-hidden="true" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{c.label}</span>
          </div>
          <div className="text-[22px] font-bold text-slate-100 font-mono tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
