import React from 'react';
import { ArrowRight } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';

const steps = [
  { label: 'GitHub', desc: 'Connect your repository' },
  { label: 'Repository Import', desc: 'Select & import the codebase' },
  { label: 'AI Analysis', desc: 'AST indexing & graph building' },
  { label: 'Software Knowledge', desc: 'Architecture, history & context' },
  { label: 'Engineering Workspace', desc: 'Dashboard, Copilot & insights' },
];

export default function SolutionSection() {
  return (
    <section
      style={{
        background: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        padding: '96px 0',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">

        {/* Header */}
        <div style={{ maxWidth: 640, margin: '0 auto 64px', textAlign: 'center' }}>
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
            How SEIS Works
          </p>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.2vw, 40px)',
              fontWeight: 800,
              lineHeight: 1.16,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              margin: 0,
            }}
          >
            From Repository to Understanding.
          </h2>
        </div>

        {/* Horizontal process — desktop */}
        <div className="hidden md:flex items-start justify-between gap-4">
          {steps.map((step, idx) => (
            <React.Fragment key={step.label}>
              <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                {/* Step number */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    border: '2px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#2563EB',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </div>

                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#0F172A',
                    marginBottom: 6,
                  }}
                >
                  {step.label}
                </div>

                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                  {step.desc}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div style={{ paddingTop: 10, color: '#CBD5E1', flexShrink: 0 }}>
                  <ArrowRight size={18} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Mobile — vertical */}
        <div className="md:hidden flex flex-col gap-6">
          {steps.map((step, idx) => (
            <div key={step.label} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '2px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#2563EB',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 13, color: '#64748B' }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div
          style={{
            marginTop: 56,
            padding: '16px 24px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <GithubIcon className="w-4 h-4" style={{ color: '#0F172A' }} />
          <span style={{ fontSize: 14, color: '#475569' }}>
            Secure GitHub OAuth · Read-only repository access · No configuration required
          </span>
        </div>

      </div>
    </section>
  );
}
