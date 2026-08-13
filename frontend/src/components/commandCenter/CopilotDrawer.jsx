import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Send } from 'lucide-react';

const MOCK_ANSWERS = {
  'How does authentication work in this project?':
    'Authentication starts at the GitHub OAuth route and passes through the authentication controller. The callback generates a session token used to access protected routes.',
  'Which module changes most often?':
    'auth/ is the most frequently modified module this month — 34 commits in the last 30 days, largely around session and token handling.',
  'Where are the highest-risk dependencies?':
    '3 direct dependencies have not been updated in over a year. They sit in the services/ layer, which also has the highest fan-in in the codebase.',
  'Summarize the architecture in plain English.':
    'Requests flow from the interface layer through the API, into services and domain logic, and finally down to infrastructure. The dependency graph is mostly one-directional with 0 circular dependencies.',
};

/**
 * MOCK ONLY — no LLM call. A fixed lookup table stands in for what would
 * later be a real Copilot response stream; the panel shape (question in,
 * answer + related files out) is what should carry over to a real
 * implementation, not this lookup table itself.
 */
export default function CopilotDrawer({ repository, suggestedQuestions, onClose }) {
  const [activeQuestion, setActiveQuestion] = useState(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Independent of focus: if the answer swap unmounts whatever the user had
  // focused (e.g. the suggested-question button they just clicked), focus
  // silently falls back to <body>, which is outside `panelRef` and would
  // otherwise stop Escape/Tab from reaching the handlers below. A
  // document-level listener keeps Escape working regardless of focus state.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Re-anchor focus inside the dialog whenever the visible content swaps
  // (question list <-> answer), so keyboard users are never dropped back to
  // the page body.
  useEffect(() => {
    closeRef.current?.focus();
  }, [activeQuestion]);

  const handleKeyDown = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-drawer-title"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-[400px] h-full bg-[#0B1220] border-l border-[#1E293B] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 h-14 px-5 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-blue-400" aria-hidden="true" />
            </span>
            <h2 id="copilot-drawer-title" className="text-[13.5px] font-bold text-slate-100 truncate">
              AI Copilot — {repository.owner}/{repository.name}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close AI Copilot"
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {!activeQuestion ? (
            <>
              <p className="text-[12.5px] text-slate-500 leading-relaxed m-0">
                Ask a question about this repository, or try one of the suggestions below.
              </p>
              <div className="flex flex-col gap-2">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setActiveQuestion(q)}
                    className="text-left text-[12.5px] text-slate-300 bg-white/[0.03] border border-[#1E293B] rounded-lg px-3.5 py-2.5 hover:bg-white/[0.06] hover:text-slate-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-blue-600/20 border border-blue-500/30 rounded-[12px_12px_2px_12px] px-3.5 py-2.5 text-[12.5px] text-blue-100">
                  {activeQuestion}
                </div>
              </div>
              <div className="flex gap-2.5 items-start">
                <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <Sparkles size={13} className="text-indigo-400" aria-hidden="true" />
                </span>
                <div className="bg-[#111A2C] border border-[#1E293B] rounded-[2px_12px_12px_12px] px-3.5 py-3 text-[12.5px] text-slate-300 leading-relaxed">
                  {MOCK_ANSWERS[activeQuestion] ?? 'This is a mock response — real answers will be generated once AI analysis is connected.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveQuestion(null)}
                className="self-start text-[12px] font-semibold text-blue-400 hover:text-blue-300 mt-1"
              >
                ← Ask something else
              </button>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#1E293B] shrink-0">
          <label htmlFor="copilot-input" className="sr-only">Ask about this repository</label>
          <div className="flex items-center gap-2 h-11 px-3.5 rounded-lg border border-[#1E293B] bg-white/[0.02]">
            <input
              id="copilot-input"
              type="text"
              disabled
              placeholder="Ask about the repository… (coming soon)"
              className="flex-1 bg-transparent text-[12.5px] text-slate-500 placeholder:text-slate-600 border-0 outline-none cursor-not-allowed"
            />
            <Send size={15} className="text-slate-700 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
