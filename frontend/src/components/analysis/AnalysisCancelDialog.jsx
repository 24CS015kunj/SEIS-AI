import React, { useEffect, useRef } from 'react';
import { OctagonX } from 'lucide-react';

/**
 * A minimal, self-contained modal dialog — no library. On open, focus moves
 * to the safe default action ("Continue Analysis"); Escape and the backdrop
 * both behave like that same default action; Tab is trapped between the two
 * buttons since they're the dialog's only focusable content.
 */
export default function AnalysisCancelDialog({ onContinue, onStop }) {
  const continueRef = useRef(null);
  const stopRef = useRef(null);

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onContinue();
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (document.activeElement === continueRef.current) stopRef.current?.focus();
    else continueRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] px-4"
      onClick={onContinue}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-desc"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.25)] p-7 text-center"
      >
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <OctagonX size={22} className="text-amber-500" aria-hidden="true" />
        </div>
        <h2 id="cancel-dialog-title" className="text-lg font-bold text-slate-900 mb-2">
          Stop repository analysis?
        </h2>
        <p id="cancel-dialog-desc" className="text-[13.5px] text-slate-500 leading-relaxed mb-6">
          Progress made so far will be discarded. You can start a new analysis at any time.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-[#0F172A] text-white text-[14px] font-semibold border-0 cursor-pointer transition-colors hover:bg-[#1E293B]"
          >
            Continue Analysis
          </button>
          <button
            ref={stopRef}
            type="button"
            onClick={onStop}
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-rose-200 bg-white text-rose-600 text-[14px] font-semibold cursor-pointer transition-colors hover:bg-rose-50"
          >
            Stop Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
