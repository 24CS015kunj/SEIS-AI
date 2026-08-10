import React from 'react';
import { GitCommit, GitBranch, GitPullRequest, Users } from 'lucide-react';

const stats = [
  { icon: GitCommit, value: '432', label: 'Commits', note: 'Full history indexed' },
  { icon: GitBranch, value: '8', label: 'Branches', note: '2 feature branches active' },
  { icon: GitPullRequest, value: '56', label: 'Pull Requests', note: '98% merge rate' },
  { icon: Users, value: '6', label: 'Contributors', note: 'All currently active' },
];

const timeline = [
  { label: 'Repository Created', date: 'Jan 2024', note: 'Initial project setup and baseline architecture', hash: '1a0b3c4' },
  { label: 'Authentication Added', date: 'Mar 2024', note: 'GitHub OAuth 2.0 and JWT session management', hash: '7f3a9e2' },
  { label: 'API Layer Expanded', date: 'Jul 2024', note: 'REST gateway and GraphQL endpoint support', hash: '9e1d4a3' },
  { label: 'Architecture Updated', date: 'Nov 2024', note: 'Modular refactoring and AST vector indexer', hash: '4b2c1f8' },
  { label: 'Major Release', date: 'Feb 2025', note: 'v2.0 with real-time AI Copilot engine', hash: '5c6d7e8' },
  { label: 'Current State', date: 'Now', note: '92% health, continuous AST sync', hash: 'HEAD' },
];

export default function SoftwareEvolutionSection() {
  return (
    <section
      id="evolution"
      style={{
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        padding: '96px 0',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">

        {/* Header */}
        <div style={{ maxWidth: 600, margin: '0 0 64px 0' }}>
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
            Software Evolution
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
            Understand How Your Software Changes Over Time.
          </h2>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.7, margin: 0 }}>
            A codebase is not static. SEIS makes the evolution of your project legible — not just the current snapshot.
          </p>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 56,
          }}
        >
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '22px 20px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} color="#2563EB" />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: '#0F172A',
                      lineHeight: 1,
                      fontFamily: 'var(--font-mono)',
                      marginBottom: 4,
                    }}
                  >
                    {s.value}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{s.note}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Timeline */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            padding: '32px 32px',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#0F172A',
              marginBottom: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Project Evolution Timeline</span>
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: '#64748B',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '3px 10px',
                borderRadius: 6,
              }}
            >
              seis-copilot · main
            </span>
          </div>

          {/* Desktop horizontal timeline */}
          <div className="hidden md:flex" style={{ gap: 0 }}>
            {timeline.map((event, idx) => (
              <div key={event.label} style={{ flex: 1, position: 'relative', paddingRight: idx < timeline.length - 1 ? 16 : 0 }}>

                {/* Connecting line */}
                {idx < timeline.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 13,
                      left: 'calc(13px + 20px)',
                      right: 0,
                      height: 1,
                      background: '#E2E8F0',
                    }}
                  />
                )}

                {/* Node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: idx === timeline.length - 1 ? '#2563EB' : '#FFFFFF',
                      border: `2px solid ${idx === timeline.length - 1 ? '#2563EB' : '#E2E8F0'}`,
                      flexShrink: 0,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {idx === timeline.length - 1 && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 4,
                          borderRadius: '50%',
                          background: '#FFFFFF',
                        }}
                      />
                    )}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: '#94A3B8',
                    marginBottom: 4,
                    display: 'flex',
                    gap: 6,
                  }}
                >
                  <span>{event.hash}</span>
                  <span>·</span>
                  <span>{event.date}</span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4, lineHeight: 1.3 }}>
                  {event.label}
                </div>

                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, paddingRight: 8 }}>
                  {event.note}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile vertical */}
          <div className="md:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {timeline.map((event) => (
              <div key={event.label} style={{ display: 'flex', gap: 16 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    border: '2px solid #E2E8F0',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#94A3B8', marginBottom: 3 }}>
                    {event.hash} · {event.date}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>
                    {event.label}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B' }}>{event.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
