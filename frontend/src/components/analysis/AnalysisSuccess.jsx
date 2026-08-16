import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, FileCode2, Layers, ArrowRight } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function AnalysisSuccess({ repository, filesProcessed, totalFiles, stageCount }) {
  const navigate = useNavigate();

  return (
    <FadeIn direction="scale">
      <div
        role="status"
        aria-live="polite"
        className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-8 py-14 sm:px-[57px] sm:py-16 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={30} className="text-emerald-500" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Repository Analysis Complete</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          <span className="font-semibold text-slate-700">{repository.owner}/{repository.name}</span> has been fully
          mapped. Architecture, dependencies, and engineering insights are ready to explore.
        </p>

        <div className="flex items-center justify-center gap-6 mb-7 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <FileCode2 size={14} className="text-slate-400" aria-hidden="true" />
            <span className="tabular-nums font-semibold text-slate-900">{filesProcessed.toLocaleString()}</span> /{' '}
            <span className="tabular-nums">{totalFiles.toLocaleString()}</span> files
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <Layers size={14} className="text-slate-400" aria-hidden="true" />
            <span className="tabular-nums font-semibold text-slate-900">{stageCount}</span> / {stageCount} stages
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 pt-5 border-t border-[#EDF0F5]">
          <button
            type="button"
            onClick={() => navigate('/command-center', { state: { repo: repository } })}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[14px] font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90 w-full sm:w-auto"
          >
            Open Engineering Command Center
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </FadeIn>
  );
}
