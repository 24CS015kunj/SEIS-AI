import React from 'react';
import { GitCommit } from 'lucide-react';

/**
 * Task 68: `activity` is a list of real, already-synced commits (`{ id,
 * message, actor, timestamp }`) -- no fabricated commit messages, authors,
 * or "analysis completed" entries. `available` distinguishes "no commits
 * have been synced yet" from "this repository genuinely has none yet",
 * matching the same honesty pattern used elsewhere on this page.
 */
export default function ActivitySection({ available, activity }) {
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-[13.5px] font-bold text-slate-900 mb-3">
        Repository Activity
      </h2>

      {!available || activity.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
          <p className="text-[13px] text-slate-400 m-0">No synced commit history for this repository yet.</p>
        </div>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
          {activity.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-3.5 py-3">
              <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <GitCommit size={13} className="text-blue-600" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] text-slate-700 leading-snug m-0">{item.message}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5 m-0">
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
