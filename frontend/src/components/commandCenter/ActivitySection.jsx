import React from 'react';
import { GitCommit, Sparkles } from 'lucide-react';

const TYPE_ICON = { commit: GitCommit, analysis: Sparkles };

export default function ActivitySection({ activity }) {
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="text-[13.5px] font-bold text-slate-100 mb-3">
        Repository Activity
      </h2>
      <ul className="flex flex-col gap-2">
        {activity.map((item) => {
          const Icon = TYPE_ICON[item.type] ?? GitCommit;
          return (
            <li key={item.id} className="flex items-start gap-3 bg-[#111A2C] border border-[#1E293B] rounded-xl px-3.5 py-3">
              <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={13} className="text-slate-400" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] text-slate-200 leading-snug m-0">{item.message}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5 m-0">
                  {item.actor} · {item.timestamp}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
