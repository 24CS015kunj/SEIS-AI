import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';

const conversations = [
  {
    prompt: 'How does authentication work in this project?',
    answer: 'Authentication starts at the GitHub OAuth route and passes through the authentication controller. The callback generates a JWT that is used to access protected API routes.',
    files: ['auth.routes.js', 'auth.controller.js', 'middleware/auth.js', 'models/User.js'],
  },
  {
    prompt: 'Where is user data stored?',
    answer: 'User data is stored in PostgreSQL via Prisma ORM. The User model defines the schema in models/User.js and the database schema in db/prisma/schema.prisma.',
    files: ['models/User.js', 'db/prisma/schema.prisma', 'services/user.service.js'],
  },
  {
    prompt: 'Which modules depend on the payment service?',
    answer: 'The payment service (services/payment.js) is imported by the order controller, subscription manager, and webhook handler. It is a high-coupling module with 8 dependents.',
    files: ['controllers/order.controller.js', 'services/subscription.js', 'webhooks/stripe.js'],
  },
  {
    prompt: 'What changed in the last release?',
    answer: 'Release v2.0 introduced the real-time AI Copilot engine, upgraded the AST indexer to v4.2, refactored the authentication middleware, and added GraphQL support to the API layer.',
    files: ['CHANGELOG.md', 'services/copilot.engine.js', 'api/graphql/schema.js'],
  },
  {
    prompt: 'Where is technical debt concentrated?',
    answer: 'The highest complexity areas are in services/astIndexer.js (cyclomatic complexity: 24) and api/v1/router.js (14 nested conditionals). These are the primary refactoring candidates.',
    files: ['services/astIndexer.js', 'api/v1/router.js'],
  },
];

export default function AiCopilotSection() {
  const [activeConv, setActiveConv] = useState(0);
  const conv = conversations[activeConv];

  return (
    <section
      id="ai-copilot"
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '96px 0',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">

        {/* Header */}
        <div style={{ maxWidth: 600, margin: '0 0 56px 0' }}>
          <p
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: '#2563EB',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            AI Copilot
          </p>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.2vw, 40px)',
              fontWeight: 800,
              lineHeight: 1.16,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              margin: '0 0 16px 0',
            }}
          >
            Ask Questions About Your Actual Codebase.
          </h2>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.7, margin: 0 }}>
            Every answer is grounded in your repository — not a generic language model response.
            SEIS references real files, real modules, and real commit history.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left — example prompts */}
          <div className="lg:col-span-4">
            <div
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: '#94A3B8',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Example Questions
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {conversations.map((c, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveConv(idx)}
                  style={{
                    padding: '11px 14px',
                    textAlign: 'left',
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: activeConv === idx ? '#BFDBFE' : 'transparent',
                    background: activeConv === idx ? '#EFF6FF' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: activeConv === idx ? '#1E40AF' : '#475569',
                    fontWeight: activeConv === idx ? 500 : 400,
                    lineHeight: 1.5,
                    transition: 'all 0.15s ease',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeConv !== idx) {
                      e.currentTarget.style.background = '#F8FAFC';
                      e.currentTarget.style.borderColor = '#E2E8F0';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeConv !== idx) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  {c.prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Right — conversation window */}
          <div className="lg:col-span-8">
            <div className="app-window" style={{ boxShadow: '0 16px 48px rgba(15,23,42,0.14)' }}>

              {/* Title bar */}
              <div className="app-titlebar">
                <span className="window-dot" style={{ background: '#EF4444' }} />
                <span className="window-dot" style={{ background: '#F59E0B' }} />
                <span className="window-dot" style={{ background: '#10B981' }} />
                <span style={{ marginLeft: 12, fontSize: 12, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                  SEIS AI Copilot — seis-copilot
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    color: '#10B981',
                    background: '#052e16',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid #166534',
                  }}
                >
                  Repository indexed
                </span>
              </div>

              {/* Chat body */}
              <div style={{ background: '#111827', padding: 24, minHeight: 360 }}>

                {/* User message */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                  <div
                    style={{
                      maxWidth: '72%',
                      background: '#1E3A5F',
                      border: '1px solid #1D4ED8',
                      borderRadius: '12px 12px 3px 12px',
                      padding: '12px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: '#60A5FA',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Developer
                    </div>
                    <div style={{ fontSize: 14, color: '#E0F2FE', lineHeight: 1.55 }}>
                      {conv.prompt}
                    </div>
                  </div>
                </div>

                {/* AI response */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
                  {/* Copilot avatar */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#0F172A',
                      border: '1px solid #1E293B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 14,
                      color: '#60A5FA',
                    }}
                  >
                    ✦
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#A78BFA',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      SEIS AI Copilot
                    </div>

                    <div
                      style={{
                        background: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '3px 12px 12px 12px',
                        padding: '14px 18px',
                        fontSize: 14,
                        color: '#CBD5E1',
                        lineHeight: 1.65,
                        marginBottom: 14,
                      }}
                    >
                      {conv.answer}
                    </div>

                    {/* Related files */}
                    <div
                      style={{
                        fontSize: 11,
                        color: '#475569',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 8,
                      }}
                    >
                      Related files:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {conv.files.map((file) => (
                        <span
                          key={file}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: '#60A5FA',
                            background: '#0F172A',
                            border: '1px solid #1E293B',
                            borderRadius: 5,
                            padding: '4px 10px',
                            cursor: 'pointer',
                          }}
                        >
                          {file}
                          <ExternalLink size={10} color="#475569" />
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Input row */}
                <div
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 14, color: '#475569', fontFamily: 'var(--font-mono)' }}>
                    Ask about your repository...
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: '#334155',
                      background: '#0F172A',
                      border: '1px solid #1E293B',
                      padding: '3px 8px',
                      borderRadius: 5,
                    }}
                  >
                    ⏎ Enter
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
