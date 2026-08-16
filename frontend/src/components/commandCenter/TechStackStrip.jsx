import React from 'react';

const LANGUAGE_COLORS = {
  JavaScript: '#F7DF1E',
  TypeScript: '#3178C6',
  Python: '#3776AB',
  CSS: '#7C3AED',
  HTML: '#F97316',
  Other: '#64748B',
};

export default function TechStackStrip({ languages }) {
  return (
    <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Technology Stack
      </span>
      <div className="h-2 w-full rounded-full overflow-hidden flex mb-3" role="img" aria-label={languages.map((l) => `${l.name} ${l.percent}%`).join(', ')}>
        {languages.map((l) => (
          <span
            key={l.name}
            style={{ width: `${l.percent}%`, background: LANGUAGE_COLORS[l.name] ?? '#64748B' }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {languages.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5 text-[12px] text-slate-400">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: LANGUAGE_COLORS[l.name] ?? '#64748B' }}
              aria-hidden="true"
            />
            {l.name} <span className="text-slate-600 tabular-nums">{l.percent}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
