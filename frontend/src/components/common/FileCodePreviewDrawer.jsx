import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, FileCode, ArrowUpRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { getRepositoryFileContent } from '../../services/repositoryService';

/**
 * Task 83: Lightweight, read-only Quick File Code Preview Drawer.
 * Fetches real file content on demand via `GET /api/github/repositories/:repositoryId/files/content?path=...`.
 * Features zero mock code, race-condition cancellation safety, accessible dialog semantics,
 * and an "Open in Architecture" deep link.
 */
export default function FileCodePreviewDrawer({ repositoryId, filePath, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error | empty
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const isOpen = Boolean(filePath);

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
