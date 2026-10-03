import React from 'react';
import { GitCommit } from 'lucide-react';

/**
 * Task 68: `activity` is a list of real, already-synced commits.
 */
export default function ActivitySection({ available, activity }) {
  return (
    <section aria-labelledby="activity-heading" className="apple-card rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
      {/* Integrated Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
            <GitCommit size={14} aria-hidden="true" />
          </span>
          <h2 id="activity-heading" className="text-[12.5px] font-semibold text-slate-800 m-0">
            Repository Activity
          </h2>
        </div>
        {available && activity.length > 0 && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200/80">
            {activity.length} commits
          </span>
        )}
      </div>

      {!available || activity.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[12px] font-mono text-slate-400 m-0">No synced commit history for this repository yet.</p>
        </div>
      ) : (
        <div className="relative max-h-[520px] overflow-y-auto">
          {/* Vertical Git timeline track */}
          <div className="absolute left-[23px] top-4 bottom-4 w-px bg-slate-200/90 pointer-events-none" />

          <ul className="divide-y divide-slate-100/80 list-none p-0 m-0">
            {activity.map((item) => (
              <li
                key={item.id}
                className="relative flex items-start gap-3 px-3.5 py-3 hover:bg-slate-50/80 transition-colors group cursor-default"
              >
                {/* Git commit node on the track */}
                <div className="relative z-10 w-4 h-4 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-blue-600 group-hover:scale-110 transition-transform">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 group-hover:bg-blue-600" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-slate-800 font-medium leading-snug m-0 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-1">
                    <span className="text-slate-600 font-medium truncate max-w-[130px]">{item.actor}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400 shrink-0">{item.timestamp}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
