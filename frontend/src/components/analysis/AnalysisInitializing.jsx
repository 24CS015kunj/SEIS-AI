import React from 'react';
import { Loader2 } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function AnalysisInitializing({ repository }) {
  return (
    <FadeIn direction="scale">
      <div
        role="status"
        aria-live="polite"
        className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] px-8 py-16 sm:px-[57px] sm:py-20 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <Loader2 size={24} className="text-blue-600 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Preparing repository analysis…</h1>
        <p className="text-sm text-slate-500 leading-relaxed max-w-[360px] mx-auto">
          Connecting to <span className="font-semibold text-slate-700">{repository.owner}/{repository.name}</span> and
          setting up the analysis workspace.
        </p>
      </div>
    </FadeIn>
  );
}
