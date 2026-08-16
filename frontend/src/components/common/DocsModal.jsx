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
4. SEIS will automatically index the repository AST tree.
5. Explore the dashboard, architecture map, and AI Copilot.`,
    code: '# No CLI required — start directly in your browser\n# Connect GitHub → Select repository → Start exploring',
  },
  {
    id: 'architecture',
    icon: Layers,
    label: 'Architecture & AST',
    title: 'Repository Architecture & AST Indexing',
    content: `SEIS builds an Abstract Syntax Tree (AST) index of your repository using Tree-Sitter and Babel parsers across 15+ languages.

The index tracks:
- Module-to-module import/export relationships
- Function and class definitions
- Dependency coupling metrics
- Circular dependency detection
- Cyclomatic complexity scoring`,
    code: '// SEIS analyzes your code server-side\n// No local installation or configuration needed\n// Supports: TypeScript, JavaScript, Python, Go, Rust, Java',
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

Answers include references to specific files, line numbers, and commit history.`,
    code: '// All Copilot responses reference your actual repository files\n// Zero hallucinations on file paths or function signatures',
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
