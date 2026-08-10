import React, { useState } from 'react';

export default function HeroProductVisual() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = ['dashboard', 'architecture'];

  return (
    <section
      style={{
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        padding: '0 0 80px',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">

        {/* Section label */}
        <div style={{ textAlign: 'center', paddingTop: 64, paddingBottom: 40 }}>
          <p style={{ fontSize: 13, color: '#94A3B8', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
            THE SEIS AI COPILOT WORKSPACE
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 32 }}>
          {[
            { id: 'dashboard', label: 'Repository Dashboard' },
            { id: 'architecture', label: 'Architecture Map' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 8,
                border: '1px solid',
                borderColor: activeTab === tab.id ? '#2563EB' : '#E2E8F0',
                background: activeTab === tab.id ? '#EFF6FF' : '#FFFFFF',
                color: activeTab === tab.id ? '#2563EB' : '#64748B',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Full product window */}
        <div className="app-window" style={{ maxWidth: '100%' }}>

          {/* Title bar */}
          <div className="app-titlebar">
            <span className="window-dot" style={{ background: '#EF4444' }} />
            <span className="window-dot" style={{ background: '#F59E0B' }} />
            <span className="window-dot" style={{ background: '#10B981' }} />
            <div style={{ marginLeft: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                SEIS AI Copilot
              </span>
              <span style={{ width: 1, height: 14, background: '#334155' }} />
              <span style={{ fontSize: 12, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                seis-ai / seis-copilot
              </span>
              <span style={{ fontSize: 11, background: '#0F172A', color: '#4ADE80', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', border: '1px solid #166534' }}>
                ✓ Synced · main
              </span>
            </div>
          </div>

          {/* App shell */}
          <div style={{ display: 'flex', height: 520 }}>

            {/* Sidebar */}
            <aside
              style={{
                width: 220,
                background: '#0F172A',
                borderRight: '1px solid #1E293B',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Repo info */}
              <div style={{ padding: '18px 16px', borderBottom: '1px solid #1E293B' }}>
                <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Active Repository
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>seis-copilot</div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  main · 7f3a9e2
                </div>
              </div>

              {/* Nav items */}
              <nav style={{ padding: '8px 0', flex: 1 }}>
                {[
                  { icon: '▦', label: 'Dashboard', active: activeTab === 'dashboard', tab: 'dashboard' },
                  { icon: '⎇', label: 'Source Control', active: false },
                  { icon: '◈', label: 'Architecture', active: activeTab === 'architecture', tab: 'architecture' },
                  { icon: '◷', label: 'Software Evolution', active: false },
                  { icon: '◉', label: 'Insights', active: false },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => item.tab && setActiveTab(item.tab)}
                    style={{
                      width: '100%',
                      padding: '9px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      color: item.active ? '#F1F5F9' : '#64748B',
                      background: item.active ? '#1E293B' : 'transparent',
                      cursor: 'pointer',
                      fontWeight: item.active ? 500 : 400,
                      border: 'none',
                      textAlign: 'left',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <span style={{ fontSize: 14, color: item.active ? '#60A5FA' : '#475569', width: 16 }}>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.active && (
                      <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#2563EB' }} />
                    )}
                  </button>
                ))}
              </nav>

              {/* Bottom status */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid #1E293B' }}>
                <div style={{ fontSize: 11, color: '#10B981', fontFamily: 'var(--font-mono)' }}>
                  ● AST Index Ready
                </div>
              </div>
            </aside>

            {/* Main Panel */}
            <main style={{ flex: 1, background: '#1A2332', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {/* Panel header */}
              <div
                style={{
                  padding: '14px 24px',
                  borderBottom: '1px solid #1E293B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#1E293B',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>
                  {activeTab === 'dashboard' && 'Repository Dashboard'}
                  {activeTab === 'architecture' && 'Architecture Map'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', background: '#0F172A', padding: '3px 8px', borderRadius: 5 }}>
                    seis-copilot
                  </span>
                </div>
              </div>

              {/* Panel content */}
              <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>

                {activeTab === 'dashboard' && <DashboardPanel />}
                {activeTab === 'architecture' && <ArchitecturePanel />}

              </div>
            </main>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, note, color = '#60A5FA' }) {
  return (
    <div
      style={{
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: 10,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
        {value}
      </div>
      {note && (
        <div style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-mono)' }}>{note}</div>
      )}
    </div>
  );
}

function DashboardPanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Left col */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <MetricCard label="Project Health" value="92%" note="Optimal" color="#10B981" />
          <MetricCard label="Architecture" value="42 modules" note="0 circular deps" color="#60A5FA" />
          <MetricCard label="Commits" value="432" note="This month: +24" color="#A78BFA" />
          <MetricCard label="AI Knowledge" value="Ready" note="AST v4.2" color="#34D399" />
        </div>

        {/* AI insight */}
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #1E3A5F',
            borderLeft: '3px solid #2563EB',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 10, color: '#3B82F6', fontFamily: 'var(--font-mono)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            ✦ AI Insight
          </div>
          <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.55, margin: 0 }}>
            "Authentication is the most frequently modified module this month — 34 commits in 30 days."
          </p>
        </div>
      </div>

      {/* Right col */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Recent Activity
        </div>
        {[
          { hash: '7f3a9e2', msg: 'Update JWT rotation middleware', author: 'alex-dev', time: '3h ago', file: 'auth/middleware.js' },
          { hash: '4b2c1f8', msg: 'Optimize AST traversal graph', author: 'sarah-eng', time: '5h ago', file: 'services/astIndexer.js' },
          { hash: '9e1d4a3', msg: 'Add rate limit headers to API', author: 'david-m', time: '1d ago', file: 'api/v1/router.js' },
          { hash: '3c8f12b', msg: 'Schema index on ast_health col', author: 'alex-dev', time: '2d ago', file: 'db/schema.prisma' },
        ].map((c) => (
          <div
            key={c.hash}
            style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#60A5FA', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {c.hash}
              </span>
              <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-mono)' }}>{c.time}</span>
            </div>
            <div style={{ fontSize: 12, color: '#CBD5E1', marginBottom: 3 }}>{c.msg}</div>
            <div style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--font-mono)' }}>
              {c.file} · {c.author}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchitecturePanel() {
  const modules = [
    { name: 'auth/', files: 12, deps: 4, commits: 34, risk: 'Low' },
    { name: 'api/v1/', files: 28, deps: 8, commits: 19, risk: 'Low' },
    { name: 'services/', files: 18, deps: 6, commits: 42, risk: 'Low' },
    { name: 'db/', files: 9, deps: 2, commits: 4, risk: 'Low' },
    { name: 'middleware/', files: 6, deps: 3, commits: 11, risk: 'Low' },
    { name: 'models/', files: 11, deps: 2, commits: 7, risk: 'Low' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {modules.map((m) => (
          <div
            key={m.name}
            style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
              {m.name}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
              <span>{m.files} files</span>
              <span>{m.deps} deps</span>
              <span>{m.commits} commits</span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: 8,
          padding: '12px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: '#4ADE80',
        }}
      >
        ✓ 0 circular dependencies detected across 42 modules
      </div>
    </div>
  );
}

function CopilotPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* User message */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '70%',
            background: '#1E3A5F',
            border: '1px solid #1D4ED8',
            borderRadius: '12px 12px 3px 12px',
            padding: '10px 14px',
            fontSize: 13,
            color: '#E0F2FE',
          }}
        >
          How does authentication work in this project?
        </div>
      </div>

      {/* AI response */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: '#0F172A',
            border: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          ✦
        </div>
        <div>
          <div
            style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: '3px 12px 12px 12px',
              padding: '12px 16px',
              fontSize: 13,
              color: '#CBD5E1',
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            Authentication starts at the GitHub OAuth route and passes through the authentication controller.
            The callback generates a JWT that is used to access protected API routes.
          </div>

          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            Related files:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['auth.routes.js', 'auth.controller.js', 'middleware/auth.js', 'models/User.js'].map((f) => (
              <span
                key={f}
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: '#60A5FA',
                  background: '#0F172A',
                  border: '1px solid #1E293B',
                  borderRadius: 5,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            background: '#0F172A',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 13, color: '#475569', fontFamily: 'var(--font-mono)' }}>
            Ask about the repository...
          </span>
          <span style={{ fontSize: 11, color: '#334155', fontFamily: 'var(--font-mono)' }}>⏎</span>
        </div>
      </div>
    </div>
  );
}
