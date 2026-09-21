import React from 'react';
import { Flame, AlertTriangle, TrendingUp, FileCode, CheckCircle } from 'lucide-react';

const RISK_BADGE = {
  high: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    text: 'text-rose-400',
    label: 'High Risk Hotspot',
    bar: 'bg-gradient-to-r from-rose-500 to-amber-500',
  },
  moderate: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    label: 'Moderate Risk',
    bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
  },
  low: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    label: 'Stable File',
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
  },
};

export default function HotspotsSection({ hotspots = [] }) {
  if (!hotspots || hotspots.length === 0) return null;

  const highRiskCount = hotspots.filter((h) => h.risk_level === 'high' || h.hotspot_score >= 70).length;

  return (
    <section id="hotspots" className="scroll-mt-20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-rose-400" aria-hidden="true" />
          <h2 className="text-[13.5px] font-bold text-slate-100">Software Evolution & Code Hotspots</h2>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-[#111A2C] border border-[#1E293B] px-2.5 py-0.5 rounded-full">
          Formula: <span className="text-amber-400">Churn × Complexity</span>
        </span>
      </div>

      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-[#1E293B]">
          <div>
            <p className="text-[13px] text-slate-300 font-medium m-0">
              Hotspot Detection Engine identified <span className="text-rose-400 font-bold">{highRiskCount} high-risk file(s)</span>.
            </p>
            <p className="text-[11.5px] text-slate-500 m-0 mt-0.5">
              Frequently modified large files with high change frequency carry the greatest regression probability.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> High ({highRiskCount})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Moderate
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Low
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {hotspots.map((item, idx) => {
            const riskLevel = item.risk_level || (item.hotspot_score >= 70 ? 'high' : item.hotspot_score >= 35 ? 'moderate' : 'low');
            const badge = RISK_BADGE[riskLevel] || RISK_BADGE.low;

            return (
              <div
                key={item.file_path || idx}
                className="bg-[#0B1220] border border-[#1E293B] hover:border-slate-700 transition-colors rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileCode size={14} className="text-slate-400 shrink-0" />
                    <span className="text-[13px] font-mono font-semibold text-slate-200 truncate">
                      {item.file_path}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="w-full bg-slate-800/60 rounded-full h-1.5 mt-2 max-w-md overflow-hidden">
                    <div
                      className={`h-full rounded-full ${badge.bar}`}
                      style={{ width: `${Math.max(item.hotspot_score, 8)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11.5px] font-mono text-slate-400 shrink-0 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px] uppercase">Churn</span>
                    <span className="font-semibold text-slate-300">{item.commit_count} commits</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px] uppercase">Lines</span>
                    <span className="font-semibold text-slate-300">{item.line_count} LOC</span>
                  </div>
                  <div className="text-right pl-2 border-l border-[#1E293B]">
                    <span className="text-slate-500 block text-[10px] uppercase">Score</span>
                    <span className={`font-bold text-[13px] ${badge.text}`}>{item.hotspot_score}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
