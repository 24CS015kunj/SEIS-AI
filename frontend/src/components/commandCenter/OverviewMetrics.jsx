import React from 'react';
import { FileCode2, Code2, Package, Users } from 'lucide-react';

const ICONS = { files: FileCode2, linesOfCode: Code2, dependencies: Package, contributors: Users };

function formatCompact(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/**
 * The highest-priority content block on the page (Figma audit hierarchy
 * item #2, "Key engineering overview") — rendered first, before insights
 * or architecture, so the reader gets orientation before detail.
 *
 * Task 68: `metrics` is a list of real, already-computed cards -- this
 * component never invents a number itself. A card with `value: null` is a
 * metric this backend genuinely cannot derive yet (e.g. Lines of Code, or
 * Dependencies when no root manifest exists) and renders "Not available"
 * plus its `hint` explaining why, instead of a fabricated placeholder.
 */
export default function OverviewMetrics({ metrics }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((m) => {
        const Icon = ICONS[m.key];
        return (
          <div key={m.key} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                <Icon size={13} className="text-blue-600" aria-hidden="true" />
              </span>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{m.label}</span>
            </div>
            <div
              className={`font-mono tabular-nums ${
                m.value == null ? 'text-[14px] font-semibold text-slate-400' : 'text-[22px] font-bold text-slate-900'
              }`}
            >
              {m.value == null ? 'Not available' : typeof m.value === 'number' ? formatCompact(m.value) : m.value}
            </div>
            {m.hint && <p className="text-[11px] text-slate-400 mt-1 m-0 leading-snug">{m.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}
