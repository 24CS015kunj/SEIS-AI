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
const ACCENTS = {
  files: {
    bg: 'bg-[#0071E3]/10',
    text: 'text-[#0071E3]',
  },
  linesOfCode: {
    bg: 'bg-[#AF52DE]/10',
    text: 'text-[#AF52DE]',
  },
  dependencies: {
    bg: 'bg-[#34C759]/10',
    text: 'text-[#34C759]',
  },
  contributors: {
    bg: 'bg-[#FF9500]/10',
    text: 'text-[#FF9500]',
  },
};

export default function OverviewMetrics({ metrics }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = ICONS[m.key];
        const accent = ACCENTS[m.key] || ACCENTS.files;
        return (
          <div 
            key={m.key} 
            className="apple-card p-5 rounded-[20px] transition-all duration-200 group relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`w-8 h-8 rounded-xl ${accent.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={accent.text} aria-hidden="true" />
                </span>
                <span className="text-[13px] font-medium text-[#86868B]">{m.label}</span>
              </div>
              <div
                className={`tabular-nums ${
                  m.value == null ? 'text-[14px] font-medium text-[#86868B]' : 'text-[26px] font-bold tracking-tight text-[#1D1D1F]'
                }`}
              >
                {m.value == null ? 'Not available' : typeof m.value === 'number' ? formatCompact(m.value) : m.value}
              </div>
            </div>
            {m.hint && <p className="text-[12px] text-[#86868B] mt-2 m-0 leading-snug font-sans">{m.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}
