import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Shared slide-over shell for Source Control's detail panels (commit,
 * pull request). Same dialog/focus-trap/Escape pattern already established
 * by Command Center's CopilotDrawer, kept as a separate local component
 * rather than touching that file, per instruction not to modify Command
 * Center unnecessarily.
 */
export default function DetailDrawer({ titleId, title, icon: Icon, onClose, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

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

  const handleTabTrap = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
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
        aria-labelledby={titleId}
        onKeyDown={handleTabTrap}
        className="relative w-full max-w-[420px] h-full bg-[#0B1220] border-l border-[#1E293B] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 h-14 px-5 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Icon size={14} className="text-blue-400" aria-hidden="true" />
              </span>
            )}
            <h2 id={titleId} className="text-[13.5px] font-bold text-slate-100 truncate">{title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
