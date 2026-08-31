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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
          width: '100%',
          maxWidth: 800,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={16} color="#60A5FA" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                SEIS AI Copilot Documentation
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                Developer Guide · v2.4
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar nav */}
          <div
            style={{
              width: 220,
              borderRight: '1px solid #E2E8F0',
              padding: '16px 12px',
              flexShrink: 0,
              overflowY: 'auto',
              background: '#F8FAFC',
            }}
          >
            {docs.map((doc) => {
              const Icon = doc.icon;
              const active = activeId === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveId(doc.id)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: active ? '#FFFFFF' : 'transparent',
                    boxShadow: active ? '0 1px 3px rgba(15,23,42,0.06)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    textAlign: 'left',
                    fontFamily: 'var(--font-sans)',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={14} color={active ? '#2563EB' : '#64748B'} />
                    <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#0F172A' : '#64748B' }}>
                      {doc.label}
                    </span>
                  </div>
                  {active && <ChevronRight size={12} color="#94A3B8" />}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '28px 28px', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 20px' }}>
              {activeDoc.title}
            </h2>
            <div
              style={{
                fontSize: 14,
                color: '#475569',
                lineHeight: 1.75,
                marginBottom: 24,
                whiteSpace: 'pre-line',
              }}
            >
              {activeDoc.content}
            </div>
            <div
              style={{
                background: '#0F172A',
                borderRadius: 10,
                padding: '16px 20px',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: '#94A3B8',
                lineHeight: 1.6,
                whiteSpace: 'pre',
                overflow: 'auto',
              }}
            >
              {activeDoc.code}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: '#0F172A',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
