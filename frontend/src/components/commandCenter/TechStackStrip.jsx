import React from 'react';
import { Layers } from 'lucide-react';

/**
 * Apple System Colors for language distribution:
 * Blue (#0071E3), Indigo (#5856D6), Purple (#AF52DE), Cyan (#32ADE6),
 * Green (#34C759), Orange (#FF9500), Pink (#FF2D55)
 */
const PALETTE = ['#0071E3', '#5856D6', '#AF52DE', '#32ADE6', '#34C759', '#FF9500', '#FF2D55'];

/**
 * Task 68: `languages` is the real, byte-weighted breakdown from GitHub's
 * own `/repos/:owner/:repo/languages` endpoint.
 */
export default function TechStackStrip({ available, languages }) {
  return (
    <div className="apple-card p-4.5 rounded-xl border border-slate-200/90 bg-white shadow-xs flex flex-col justify-between min-h-[132px]">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
              <Layers size={15} aria-hidden="true" />
            </span>
            <span className="text-[12.5px] font-semibold text-slate-700">Technology Stack</span>
          </div>
          {available && languages.length > 0 && (
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200/80">
              {languages.length} {languages.length === 1 ? 'lang' : 'langs'}
            </span>
          )}
        </div>

        {!available || languages.length === 0 ? (
          <p className="text-[12px] font-mono text-slate-400 m-0 mt-3">Not available yet for this repository.</p>
        ) : (
          <>
            {/* Segmented language distribution bar */}
            <div
              className="h-2 w-full rounded-md overflow-hidden flex gap-0.5 bg-slate-100 mb-3"
              role="img"
              aria-label={languages.map((l) => `${l.name} ${l.percent}%`).join(', ')}
            >
              {languages.map((l, i) => (
                <span
                  key={l.name}
                  style={{ width: `${l.percent}%`, background: PALETTE[i % PALETTE.length] }}
                  className="h-full"
                  title={`${l.name}: ${l.percent}%`}
                />
              ))}
            </div>

            {/* Language breakdown grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
              {languages.slice(0, 6).map((l, i) => (
                <div key={l.name} className="flex items-center justify-between text-[11.5px] min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                      aria-hidden="true"
                    />
                    <span className="text-slate-700 font-medium truncate">{l.name}</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[11px] tabular-nums shrink-0 ml-1">
                    {l.percent}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
