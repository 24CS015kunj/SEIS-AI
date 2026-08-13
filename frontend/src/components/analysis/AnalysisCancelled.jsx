import React from 'react';
import { Link } from 'react-router-dom';
import { OctagonX, RotateCw } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function AnalysisCancelled({ repository, onRestart }) {
  return (
    <FadeIn direction="scale">
      <div
        role="status"
        aria-live="polite"
        className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-8 py-14 sm:px-[57px] sm:py-16 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <OctagonX size={28} className="text-slate-500" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Analysis Cancelled</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8 max-w-[380px] mx-auto">
          Analysis of <span className="font-semibold text-slate-700">{repository.owner}/{repository.name}</span> was
          stopped. No changes were made to the repository.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[#0F172A] text-white text-[14.5px] font-semibold border-0 cursor-pointer transition-colors hover:bg-[#1E293B] w-full sm:w-auto"
          >
            <RotateCw size={16} aria-hidden="true" />
            Start New Analysis
          </button>
          <Link
            to="/import-repository"
            className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-[#E2E8F0] text-slate-700 text-[14.5px] font-semibold no-underline transition-colors hover:bg-slate-50 w-full sm:w-auto"
          >
            Back to Import Repository
          </Link>
        </div>
      </div>
    </FadeIn>
  );
}
