import React from 'react';

/**
 * A restrained, brand-consistent rotation (blue-600 first, matching the
 * product's single primary accent) used to visually distinguish language
 * segments -- assigned by position, not tied to any particular language,
 * so this never implies a per-language "brand color" claim.
 */
const PALETTE = ['#2563EB', '#6366F1', '#0EA5E9', '#94A3B8', '#38BDF8', '#818CF8', '#64748B'];

/**
 * Task 68: `languages` is the real, byte-weighted breakdown from GitHub's
 * own `/repos/:owner/:repo/languages` endpoint (the same source GitHub's
 * own repository page uses) -- never a hardcoded percentage split. When
 * `available` is false (no synced branch, or GitHub reported nothing),
 * this shows an honest empty state instead of a fabricated bar.
 */
export default function TechStackStrip({ available, languages }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">
        Technology Stack
      </span>

      {!available || languages.length === 0 ? (
        <p className="text-[12.5px] text-slate-400 m-0">Not available yet for this repository.</p>
      ) : (
        <>
          <div
            className="h-2 w-full rounded-full overflow-hidden flex mb-3 bg-slate-100"
            role="img"
            aria-label={languages.map((l) => `${l.name} ${l.percent}%`).join(', ')}
          >
            {languages.map((l, i) => (
              <span
                key={l.name}
                style={{ width: `${l.percent}%`, background: PALETTE[i % PALETTE.length] }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {languages.map((l, i) => (
              <span key={l.name} className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                  aria-hidden="true"
                />
                {l.name} <span className="text-slate-400 tabular-nums">{l.percent}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
