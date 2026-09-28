import React from 'react';

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
    <div className="apple-card p-5 rounded-[20px]">
      <span className="block text-[13.5px] font-semibold text-[#1D1D1F] mb-3">
        Technology Stack
      </span>

      {!available || languages.length === 0 ? (
        <p className="text-[12.5px] text-[#86868B] m-0">Not available yet for this repository.</p>
      ) : (
        <>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden flex mb-4 bg-black/[0.05] p-0.5"
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
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {languages.map((l, i) => (
              <span key={l.name} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#1D1D1F]">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                  aria-hidden="true"
                />
                {l.name} <span className="text-[#86868B] tabular-nums text-[12px]">{l.percent}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
