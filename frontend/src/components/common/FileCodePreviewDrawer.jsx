import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, FileCode, ArrowUpRight, Loader2, AlertCircle, RefreshCw, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { getRepositoryFileContent, explainFile } from '../../services/repositoryService';
import CopilotMarkdown from '../commandCenter/CopilotMarkdown';

/**
 * Task 83: Lightweight, read-only Quick File Code Preview Drawer.
 * Fetches real file content on demand via `GET /api/github/repositories/:repositoryId/files/content?path=...`.
 * Features zero mock code, race-condition cancellation safety, accessible dialog semantics,
 * and an "Open in Architecture" deep link.
 *
 * Task 93: "Explain with AI" button triggers CODE_EXPLANATION via the existing
 * RAG/LLM pipeline (RepositoryExplainService). The explanation is shown in a
 * collapsible ExplanationCard below the code view. Citations render as
 * Architecture deep-links (same pattern as CopilotDrawer).
 */
export default function FileCodePreviewDrawer({ repositoryId, filePath, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error | empty
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Task 93: explanation state
  const [explainStatus, setExplainStatus] = useState('idle'); // idle | loading | ready | error
  const [explanation, setExplanation] = useState(null); // { answer, citations }
  const [explainError, setExplainError] = useState(null);
  const [explainOpen, setExplainOpen] = useState(true);

  const isOpen = Boolean(filePath);

  // Reset all state when the target file changes
  useEffect(() => {
    if (!isOpen || !repositoryId || !filePath) {
      setStatus('idle');
      setFileData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);
    // Reset explanation when a new file is opened
    setExplainStatus('idle');
    setExplanation(null);
    setExplainError(null);
    setExplainOpen(true);

    getRepositoryFileContent(repositoryId, filePath)
      .then((data) => {
        if (cancelled) return;
        setFileData(data);
        if (!data || data.content == null) {
          setStatus('empty');
        } else {
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setError(err.response?.data?.message || 'Unable to load file content.');
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, filePath, isOpen, retryNonce]);

  // Global Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const lines = useMemo(() => {
    if (!fileData || fileData.content == null) return [];
    return fileData.content.split('\n');
  }, [fileData]);

  // Task 93: trigger explanation
  const handleExplain = async () => {
    if (!repositoryId || !filePath || explainStatus === 'loading') return;
    setExplainStatus('loading');
    setExplanation(null);
    setExplainError(null);
    setExplainOpen(true);
    try {
      const data = await explainFile(repositoryId, filePath);
      setExplanation({ answer: data.answer, citations: data.citations ?? [] });
      setExplainStatus('ready');
    } catch (err) {
      setExplainStatus('error');
      setExplainError(err.response?.data?.message || 'Unable to generate explanation. Make sure this repository has been ingested.');
    }
  };

  if (!isOpen) return null;

  const fileName = filePath ? filePath.split('/').pop() : 'File Preview';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`File code preview: ${filePath}`}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] md:w-[680px] bg-white border-l border-slate-200 shadow-2xl flex flex-col focus:outline-none animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-slate-200 shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCode size={18} className="text-blue-600 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-[14px] font-bold text-slate-900 truncate leading-snug">
                {fileName}
              </h2>
              <p className="text-[11px] font-mono text-slate-500 truncate m-0" title={filePath}>
                {filePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Task 93: Explain with AI button */}
            {repositoryId && filePath && status === 'ready' && (
              <button
                type="button"
                id="explain-with-ai-btn"
                onClick={handleExplain}
                disabled={explainStatus === 'loading'}
                aria-label="Explain this file with AI"
                aria-busy={explainStatus === 'loading'}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[12px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {explainStatus === 'loading' ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={12} aria-hidden="true" />
                )}
                <span>{explainStatus === 'loading' ? 'Explaining…' : 'Explain with AI'}</span>
              </button>
            )}

            {repositoryId && filePath && (
              <Link
                to={`/architecture/${repositoryId}?file=${encodeURIComponent(filePath)}`}
                onClick={onClose}
                aria-label={`Open ${filePath} in Architecture`}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-blue-700 hover:bg-blue-50 text-[12px] font-semibold no-underline transition-colors"
              >
                <span>Open in Architecture</span>
                <ArrowUpRight size={13} className="shrink-0" aria-hidden="true" />
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Sub-header info bar */}
        {status === 'ready' && fileData && (
          <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0">
            <span>
              {lines.length} line{lines.length === 1 ? '' : 's'}
              {fileData.size != null && ` · ${(fileData.size / 1024).toFixed(1)} KB`}
            </span>
            <span className="text-slate-400">Read-only real preview</span>
          </div>
        )}

        {/* Task 93: AI Explanation Card */}
        {(explainStatus === 'loading' || explainStatus === 'ready' || explainStatus === 'error') && (
          <div
            role="region"
            aria-live="polite"
            aria-label="AI file explanation"
            className="shrink-0 border-b border-blue-100 bg-blue-50/50"
          >
            {/* Collapsible header */}
            <button
              type="button"
              onClick={() => setExplainOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left"
              aria-expanded={explainOpen}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-blue-600" aria-hidden="true" />
                <span className="text-[12.5px] font-semibold text-blue-800">AI Explanation</span>
                {explainStatus === 'loading' && (
                  <Loader2 size={12} className="animate-spin text-blue-500 ml-1" aria-hidden="true" />
                )}
              </div>
              {explainStatus !== 'loading' && (
                explainOpen
                  ? <ChevronUp size={14} className="text-blue-500 shrink-0" aria-hidden="true" />
                  : <ChevronDown size={14} className="text-blue-500 shrink-0" aria-hidden="true" />
              )}
            </button>

            {explainOpen && (
              <div className="px-4 pb-4">
                {explainStatus === 'loading' ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-blue-100 rounded w-3/4" />
                    <div className="h-3 bg-blue-100 rounded w-full" />
                    <div className="h-3 bg-blue-100 rounded w-5/6" />
                    <div className="h-3 bg-blue-100 rounded w-2/3" />
                  </div>
                ) : explainStatus === 'error' ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-[12px] text-rose-600 m-0 leading-relaxed">{explainError}</p>
                  </div>
                ) : explanation ? (
                  <>
                    <div className="text-[12.5px] text-slate-800 leading-relaxed prose-sm max-w-none">
                      <CopilotMarkdown content={explanation.answer} />
                    </div>
                    {explanation.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {explanation.citations.map((c, i) => (
                          <Link
                            key={c.chunk_id ?? i}
                            to={`/architecture/${repositoryId}?file=${encodeURIComponent(c.file_path)}`}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 text-[11px] font-mono font-semibold no-underline transition-colors"
                            title={`${c.file_path} lines ${c.start_line}–${c.end_line}`}
                          >
                            [{i + 1}] {c.file_path.split('/').pop()}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-[#FAFAFC]">
          {status === 'loading' ? (
            <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-slate-400">
              <Loader2 size={18} className="animate-spin text-blue-600" aria-hidden="true" />
              <span>Loading file content…</span>
            </div>
          ) : status === 'error' ? (
            <div className="p-6 flex flex-col items-center text-center gap-3 mt-10">
              <AlertCircle size={22} className="text-rose-500" aria-hidden="true" />
              <p className="text-[13.5px] text-rose-600 m-0 font-medium">
                {error || 'Unable to load file content.'}
              </p>
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          ) : status === 'empty' ? (
            <div className="p-8 text-center text-[13px] text-slate-400">
              File content is not available or file is empty.
            </div>
          ) : (
            <div className="font-mono text-[12px] leading-[1.6] select-text overflow-x-auto">
              <table className="min-w-full border-collapse">
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-100/60">
                      <td className="w-12 py-0.5 pr-3 text-right text-slate-300 select-none border-r border-slate-200/60 bg-slate-50/50 shrink-0">
                        {idx + 1}
                      </td>
                      <td className="py-0.5 pl-4 pr-4 text-slate-800 whitespace-pre font-mono">
                        {line || ' '}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
