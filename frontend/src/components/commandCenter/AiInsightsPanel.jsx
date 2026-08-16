import React from 'react';
import { AlertOctagon, AlertTriangle, Info, Sparkles } from 'lucide-react';

const SEVERITY = {
  critical: { icon: AlertOctagon, label: 'Critical', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  warning: { icon: AlertTriangle, label: 'Warning', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  info: { icon: Info, label: 'Info', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

/**
 * Fixes the Figma audit's "AI Insights panel is empty" finding: this always
 * renders a real, structured list — never a blank card. `insights` is a
 * flat array of {severity,title,description,category}, matching the shape
 * a future real-AI response would use, so swapping the mock for a live
 * result needs no change here.
 */
export default function AiInsightsPanel({ insights }) {
  return (
    <section id="insights" className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-indigo-400" aria-hidden="true" />
        <h2 className="text-[13.5px] font-bold text-slate-100">AI Insights</h2>
      </div>

      {insights.length === 0 ? (
        <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-6 text-center">
          <p className="text-[13px] text-slate-500 m-0">No notable findings for this repository yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {insights.map((insight) => {
            const s = SEVERITY[insight.severity] ?? SEVERITY.info;
            const Icon = s.icon;
            return (
              <li
                key={insight.id}
                className={`flex items-start gap-3 rounded-xl border p-4 ${s.bg} ${s.border}`}
              >
                <Icon size={16} className={`${s.text} shrink-0 mt-0.5`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[13.5px] font-semibold text-slate-100">{insight.title}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${s.text}`}>{s.label}</span>
                    <span className="text-[10.5px] text-slate-500 bg-white/5 rounded-full px-2 py-0.5">
                      {insight.category}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-slate-400 leading-relaxed m-0">{insight.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
