import React from 'react';
import { GitCommit } from 'lucide-react';

/**
 * Task 68: `activity` is a list of real, already-synced commits.
 */
export default function ActivitySection({ available, activity }) {
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-[13.5px] font-semibold text-[#1D1D1F] mb-3">
        Repository Activity
      </h2>

      {!available || activity.length === 0 ? (
        <div className="apple-card p-6 text-center">
          <p className="text-[13px] text-[#86868B] m-0">No synced commit history for this repository yet.</p>
        </div>
      ) : (
        <ul className="apple-card divide-y divide-black/[0.04] overflow-hidden">
          {activity.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors">
              <span className="w-7 h-7 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0 mt-0.5">
                <GitCommit size={14} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] text-[#1D1D1F] font-medium leading-snug m-0">{item.message}</p>
                <p className="text-[11.5px] text-[#86868B] mt-0.5 m-0">
                  {item.actor} · {item.timestamp}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
