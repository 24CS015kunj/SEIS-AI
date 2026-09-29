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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
      {metrics.map((m) => {
        const Icon = ICONS[m.key];
        const accent = ACCENTS[m.key] || ACCENTS.files;
        const isAvailable = m.value != null;

        return (
          <div
            key={m.key}
            className="apple-card p-4.5 rounded-xl border border-slate-200/90 bg-white shadow-xs hover:border-slate-300 transition-all duration-150 flex flex-col justify-between min-h-[132px]"
          >
            {/* Top row: Icon, Label, and Status Indicator */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-7 h-7 rounded-lg ${accent.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={15} className={accent.text} aria-hidden="true" />
                  </span>
                  <span className="text-[12.5px] font-semibold text-slate-700 truncate">{m.label}</span>
                </div>
                <span
                  className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border shrink-0 ${
                    isAvailable
                      ? 'bg-slate-50 text-slate-600 border-slate-200/80'
                      : 'bg-amber-50 text-amber-700 border-amber-200/80'
                  }`}
                >
                  {isAvailable ? 'Live' : 'N/A'}
                </span>
              </div>

              {/* Metric Value */}
              <div className="flex items-baseline gap-1.5 mt-1">
                <span
                  className={`tabular-nums font-mono tracking-tight ${
                    isAvailable
                      ? 'text-[24px] font-bold text-slate-900'
                      : 'text-[20px] font-semibold text-slate-400'
                  }`}
                >
                  {isAvailable
                    ? typeof m.value === 'number'
                      ? formatCompact(m.value)
                      : m.value
                    : '—'}
                </span>
                {!isAvailable && (
                  <span className="text-[11.5px] font-mono text-slate-400">Not indexed</span>
                )}
              </div>
            </div>

            {/* Hint / Subtitle Footer */}
            {m.hint && (
              <p
                className="text-[11px] font-mono text-slate-500 mt-2.5 m-0 leading-tight border-t border-slate-100 pt-2 truncate"
                title={m.hint}
              >
                {m.hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
