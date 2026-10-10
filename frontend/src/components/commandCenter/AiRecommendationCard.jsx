import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function AiRecommendationCard({ analysis, onGenerate, generating }) {
  const insights = analysis?.insights || [];
  
  // Find a suitable recommendation: preferably critical or major refactoring/high risk
  const recommendation = insights.find(i => i.severity === 'critical') || 
                        insights.find(i => i.category === 'refactoring_recommended') || 
                        insights[0];

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-500/10 dark:to-blue-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 p-5 h-full flex flex-col relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Sparkles size={80} className="text-indigo-600 dark:text-indigo-400" />
      </div>

      <div className="flex items-center gap-2 mb-4 relative z-10">
        <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">AI Recommendation</h2>
      </div>

      {!analysis ? (
        <div className="flex-1 flex flex-col items-start justify-center relative z-10">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">No recommendations available yet.</p>
          <button 
            onClick={onGenerate}
            disabled={generating}
            className="px-4 py-2 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            Run Analysis
          </button>
        </div>
      ) : !recommendation ? (
        <div className="flex-1 flex flex-col justify-center relative z-10">
          <p className="text-sm text-slate-600 dark:text-slate-300">Your repository is looking great! No active recommendations from SEIS AI at this time.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative z-10">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{recommendation.summary || recommendation.subject}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 line-clamp-3">
            {recommendation.recommendation}
          </p>
          <div className="mt-auto pt-2">
            <button className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 group">
              Review recommendation 
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
