import React from 'react';
import { Flame } from 'lucide-react';

export default function TopRiskModules({ analysisData, onPreviewFile, onGenerate }) {
  const hotspots = analysisData?.hotspots || [];
  const topHotspots = [...hotspots].sort((a, b) => b.hotspot_score - a.hotspot_score).slice(0, 3);

  return (
    <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Flame size={18} className="text-orange-500" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Top Risk Modules</h2>
      </div>

      {!analysisData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">No hotspot analysis available yet.</p>
          <button onClick={onGenerate} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-semibold transition-colors">
            Run Analysis
          </button>
        </div>
      ) : topHotspots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">No high-risk modules identified.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-3">
          {topHotspots.map((h, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <button 
                  onClick={() => onPreviewFile && onPreviewFile(h.file_path)}
                  className="font-mono text-slate-700 dark:text-slate-300 truncate hover:text-blue-600 dark:hover:text-blue-400 text-left bg-transparent border-0 p-0 cursor-pointer max-w-[70%]"
                  title={h.file_path}
                >
                  {h.file_path}
                </button>
                <span className="font-semibold text-slate-600 dark:text-slate-400">{Math.round(h.hotspot_score)}</span>
              </div>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className={`h-full rounded-full ${h.hotspot_score > 80 ? 'bg-rose-500' : h.hotspot_score > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.max(5, h.hotspot_score)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
