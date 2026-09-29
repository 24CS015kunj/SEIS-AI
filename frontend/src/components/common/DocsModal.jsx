import React, { useState } from 'react';
import { X, BookOpen, Terminal, Layers, MessageSquare, ChevronRight } from 'lucide-react';

const docs = [
  {
    id: 'getting-started',
    icon: Terminal,
    label: 'Getting Started',
    title: 'Getting Started with SEIS AI Copilot',
    content: `Connect your GitHub account using OAuth 2.0. SEIS requests only read-only access to repository structure, commit history, and file metadata.

1. Click "Continue with GitHub" on the homepage.
2. Authorize SEIS to access your repositories.
3. Select the repository you want to analyze.
4. SEIS syncs the repository's files, branches, and commit history.
5. Explore the dashboard, architecture view, and AI Copilot.`,
    code: '# No CLI required — start directly in your browser\n# Connect GitHub → Select repository → Start exploring',
  },
  {
    id: 'architecture',
    icon: Layers,
    label: 'Architecture',
    title: 'Repository Architecture',
    content: `SEIS builds a real directory and file tree from your repository's synced source, plus a language breakdown sourced directly from GitHub's own languages API.

Currently available:
- Full repository directory/file structure
- Per-directory and per-file counts
- Language breakdown by file
- Commit-churn-based hotspot and trend analysis (AI Insights)

Not yet available — shown honestly as "Not available" in the product rather than guessed at:
- Import/export dependency graphs
- Circular dependency detection
- Cyclomatic complexity scoring`,
    code: '// Architecture data is derived from real synced files and commits\n// No dependency-graph engine exists yet — the product says so directly\n// rather than inferring relationships from directory names or proximity',
  },
  {
    id: 'copilot',
    icon: MessageSquare,
    label: 'AI Copilot',
    title: 'Using the AI Copilot',
    content: `The SEIS AI Copilot answers questions about your specific repository. Every answer is grounded in your actual code — not generic knowledge.

Example questions:
- "How does authentication work?"
- "Which modules depend on the payment service?"
- "Where is user data stored?"
- "What changed in the last release?"
- "Where is technical debt concentrated?"

Answers cite the specific indexed files and line ranges they're grounded in, so you can verify the source yourself.`,
    code: '// Copilot answers are grounded in your indexed repository content\n// Every answer includes citations back to real file paths and line ranges',
  },
];

export default function DocsModal({ isOpen, onClose }) {
  const [activeId, setActiveId] = useState('getting-started');

  if (!isOpen) return null;

  const activeDoc = docs.find((d) => d.id === activeId);

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-[800px] max-h-[85vh] flex flex-col overflow-hidden transition-colors"
      >
        {/* Header */}
        <div
          className="px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-blue-600/20 dark:border dark:border-blue-500/30 flex items-center justify-center"
            >
              <BookOpen size={16} className="text-blue-400" />
            </div>
            <div>
              <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
                SEIS AI Copilot Documentation
              </div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400 font-mono">
                Developer Guide · v2.4
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">

          {/* Sidebar nav */}
          <div
            className="w-full sm:w-[220px] border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 p-3 sm:p-4 shrink-0 overflow-y-auto bg-slate-50 dark:bg-slate-900/60"
          >
            {docs.map((doc) => {
              const Icon = doc.icon;
              const active = activeId === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveId(doc.id)}
                  className={`w-full px-3 py-2.5 rounded-lg border-0 transition-colors cursor-pointer flex items-center justify-between gap-2 text-left mb-1 ${
                    active
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'} />
                    <span className="text-[13px]">
                      {doc.label}
                    </span>
                  </div>
                  {active && <ChevronRight size={12} className="text-slate-400" />}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
            <h2 className="text-[18px] sm:text-[20px] font-bold text-slate-900 dark:text-slate-100 m-0 mb-4">
              {activeDoc.title}
            </h2>
            <div
              className="text-[14px] text-slate-600 dark:text-slate-300 leading-relaxed mb-6 whitespace-pre-line"
            >
              {activeDoc.content}
            </div>
            <div
              className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-[13px] text-slate-300 leading-relaxed whitespace-pre overflow-auto"
            >
              {activeDoc.code}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end shrink-0"
        >
          <button
            onClick={onClose}
            className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13px] cursor-pointer border-0 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
