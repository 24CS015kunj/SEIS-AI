import React, { useEffect, useState } from 'react';
import { X, FileCode, Copy, Check, ExternalLink, Loader2 } from 'lucide-react';
import { getRepositoryFileContent } from '../../services/repositoryService';

/**
 * CitationDrawer component displays the source file snippet and line range
 * for a selected citation in an interactive slide-out panel.
 */
export default function CitationDrawer({ repositoryId, citation, isOpen, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !citation || !repositoryId) {
      setContent(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getRepositoryFileContent(repositoryId, citation.file_path)
      .then((fileData) => {
        if (isMounted) {
          setContent(fileData.content);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Could not load file content.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, citation, repositoryId]);

  if (!isOpen || !citation) return null;

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract subset of lines if start_line and end_line exist
  const getSnippetLines = () => {
    if (!content) return [];
    const allLines = content.split('\n');
    if (citation.start_line && citation.end_line) {
      const start = Math.max(1, citation.start_line) - 1;
      const end = Math.min(allLines.length, citation.end_line);
      return allLines.slice(start, end).map((lineText, idx) => ({
        lineNum: start + idx + 1,
        text: lineText,
      }));
    }
    return allLines.slice(0, 100).map((lineText, idx) => ({
      lineNum: idx + 1,
      text: lineText,
    }));
  };

  const snippetLines = getSnippetLines();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-100/70 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <FileCode size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {citation.file_path}
              </h3>
              <p className="text-xs font-mono text-slate-500">
                {citation.start_line && citation.end_line
                  ? `Lines ${citation.start_line} – ${citation.end_line}`
                  : 'Source File Citation'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                title="Copy code"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-900 font-mono text-xs text-slate-100">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 gap-2">
              <Loader2 size={18} className="animate-spin text-blue-400" />
              <span>Loading source snippet...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300">
              <p className="font-sans text-sm font-medium m-0">Failed to load snippet</p>
              <p className="text-xs text-rose-400 mt-1 m-0">{error}</p>
            </div>
          ) : snippetLines.length > 0 ? (
            <div className="space-y-0.5">
              {snippetLines.map((line) => (
                <div key={line.lineNum} className="flex hover:bg-slate-800/60 rounded px-1">
                  <span className="w-10 text-slate-500 select-none text-right pr-4 shrink-0">
                    {line.lineNum}
                  </span>
                  <span className="whitespace-pre overflow-x-auto text-slate-200 font-mono">
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 italic">No content available for this snippet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
