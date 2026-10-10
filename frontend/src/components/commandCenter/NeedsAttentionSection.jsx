import React from 'react';
import { AlertOctagon, AlertTriangle, Info, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

const SEVERITY = {
  critical: { icon: AlertOctagon, label: 'Critical', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-800' },
  major: { icon: AlertTriangle, label: 'Warning', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-800' },
  minor: { icon: Info, label: 'Info', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-800' },
};

export default function NeedsAttentionSection({ status, analysis, onPreviewFile, onGenerate, generating }) {
  const insights = analysis?.insights || [];
  const topInsights = insights.slice(0, 4);

  return (
    <section className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Needs Attention</h2>
        </div>
        {insights.length > 4 && (
          <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1">
            View all insights <ArrowRight size={12} />
          </button>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {status === 'loading' || generating ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-50">
            <Sparkles size={24} className="text-blue-500 mb-3 animate-pulse" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Analyzing repository for issues...</p>
          </div>
        ) : status === 'none' || !analysis ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <Sparkles size={28} className="text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">No analysis available</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-62.5 mb-4">Run an AI analysis to detect architectural issues and maintenance risks.</p>
            <button onClick={onGenerate} disabled={generating} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">
              Run Analysis
            </button>
          </div>
        ) : topInsights.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
              <ShieldCheck size={24} className="text-emerald-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Looking good!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-62.5">No critical issues detected. Your repository is in good health.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {topInsights.map((insight, i) => {
              const s = SEVERITY[insight.severity] || SEVERITY.minor;
              const Icon = s.icon;
              return (
                <li key={i} className={`rounded-xl border p-4 ${s.bg} ${s.border} relative overflow-hidden`}>
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-current opacity-20"></div>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1 rounded-full bg-white/60 dark:bg-black/20 ${s.text}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>{s.label}</span>
                        <button 
                          onClick={() => onPreviewFile && onPreviewFile(insight.subject)}
                          className="text-xs font-mono font-semibold text-slate-900 dark:text-white truncate hover:underline text-left cursor-pointer bg-transparent border-0 p-0"
                        >
                          {insight.subject}
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-2 font-medium">{insight.summary}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        <span className="font-semibold">Recommended action:</span> {insight.recommendation}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
