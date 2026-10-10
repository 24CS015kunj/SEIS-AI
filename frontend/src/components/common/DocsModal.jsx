import React, { useState } from 'react';
import { X, BookOpen, Terminal, Layers, MessageSquare, ChevronRight } from 'lucide-react';

const docs = [
  {
    id: 'getting-started',
    icon: Terminal,
    label: 'Getting Started',
    title: 'Getting Started with SEIS AI Copilot',
    content: `Connect your GitHub account using OAuth 2.0. SEIS requests only read-only access to repository structure, commit history, and file metadata.

1. Click "Connect Repository with GitHub" on the homepage.
2. Authorize SEIS to access your repositories.
3. Select the repository you want to analyze.
4. SEIS syncs the repository's files, branches, and commit history.
5. Explore the dashboard, architecture view, and AI Copilot.`,
    code: '# No CLI required - start directly in your browser\n# Connect GitHub -> Select repository -> Start exploring',
  },
  {
    id: 'architecture',
    icon: Layers,
    label: 'Architecture',
    title: 'Repository Architecture & AST Mapping',
    content: `SEIS builds a real directory and file tree from your repository's synced source, plus a language breakdown sourced directly from GitHub's languages API and AST parser.

Available Capabilities:
- Full repository directory & file structure
- Directed dependency graphs & cycle detection
- Language breakdown by file count & AST symbols
- Commit-churn-based hotspot and trend analysis
- Cyclomatic complexity & risk scoring`,
    code: '// Architecture data is derived from real synced files and AST AST symbols\n// Dependency graphs and circular import warnings are computed deterministically',
  },
  {
    id: 'copilot',
    icon: MessageSquare,
    label: 'AI Copilot',
    title: 'Using the Grounded AI Copilot',
    content: `The SEIS AI Copilot answers questions about your specific repository. Every answer is grounded in your actual code - zero hallucination guarantee.

Example queries:
- "How does authentication flow from frontend to backend?"
- "Which modules depend on the payment service?"
- "Where is user data stored and mutated?"
- "What changed in the last release?"
- "Where is technical debt and coupling concentrated?"

Answers cite specific indexed files and line ranges they are grounded in.`,
    code: '// Copilot answers are grounded in your indexed repository content\n// Every answer includes citations back to real file paths and line ranges',
  },
];

export default function DocsModal({ isOpen, onClose }) {
  const [activeId, setActiveId] = useState('getting-started');

  if (!isOpen) return null;

  const activeDoc = docs.find((d) => d.id === activeId);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[var(--seis-surface-1)] text-[var(--seis-text-primary)] rounded-2xl border border-[var(--seis-border-strong)] shadow-2xl w-full max-w-[800px] max-h-[85vh] flex flex-col overflow-hidden transition-colors"
      >
        {/* Header */}
        <div
          className="px-6 py-4 sm:py-5 border-b border-[var(--seis-border-subtle)] flex items-center justify-between shrink-0 bg-[var(--seis-surface-2)]"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg bg-[var(--seis-highlight)] border border-[var(--seis-cyan)]/30 flex items-center justify-center text-[var(--seis-cyan)]"
            >
              <BookOpen size={16} />
            </div>
            <div>
              <div className="text-[15px] font-bold text-[var(--seis-text-primary)]">
                SEIS AI Copilot Documentation
              </div>
              <div className="text-[12px] text-[var(--seis-text-muted)] font-mono">
                Developer Guide - v2.4
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">

          {/* Sidebar nav */}
          <div
            className="w-full sm:w-[220px] border-b sm:border-b-0 sm:border-r border-[var(--seis-border-subtle)] p-3 sm:p-4 shrink-0 overflow-y-auto bg-[var(--seis-surface-2)]"
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
                      ? 'bg-[var(--seis-highlight)] text-[var(--seis-cyan)] font-semibold shadow-xs'
                      : 'bg-transparent text-[var(--seis-text-secondary)] hover:bg-[var(--seis-surface-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={active ? 'text-[var(--seis-cyan)]' : 'text-[var(--seis-text-muted)]'} />
                    <span className="text-[13px]">
                      {doc.label}
                    </span>
                  </div>
                  {active && <ChevronRight size={12} className="text-[var(--seis-cyan)]" />}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
            <h2 className="text-[18px] sm:text-[20px] font-bold text-[var(--seis-text-primary)] m-0 mb-4">
              {activeDoc.title}
            </h2>
            <div
              className="text-[14px] text-[var(--seis-text-secondary)] leading-relaxed mb-6 whitespace-pre-line"
            >
              {activeDoc.content}
            </div>
            <div
              className="bg-[var(--seis-surface-inset)] border border-[var(--seis-border-subtle)] rounded-xl p-4 font-mono text-[12.5px] text-[var(--seis-text-primary)] leading-relaxed whitespace-pre overflow-auto"
            >
              {activeDoc.code}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          className="px-6 py-3.5 border-t border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] flex items-center justify-end shrink-0"
        >
          <button
            onClick={onClose}
            className="btn-tool-primary h-8.5 px-4 text-[13px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
