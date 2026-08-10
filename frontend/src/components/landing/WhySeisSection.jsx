import React from 'react';
import { Check } from 'lucide-react';

const traditional = [
  'Store code and version history',
  'Manage branches and merges',
  'Review code changes',
  'Track issues and milestones',
];

const seis = [
  'Understand architecture and module relationships',
  'Connect code dependencies and system flow',
  'Analyze software evolution over time',
  'Answer repository-specific questions in natural language',
  'Surface engineering insights and risk areas',
];

export default function WhySeisSection() {
  return (
    <section
      id="why-seis"
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '96px 0',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">

        {/* Header */}
        <div style={{ maxWidth: 640, margin: '0 0 56px 0' }}>
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
            Why SEIS
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
            More Than Repository Management.
          </h2>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.7, margin: 0 }}>
            SEIS is positioned as an intelligence layer that works alongside your existing GitHub workflows — not a replacement.
          </p>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Traditional */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '32px 28px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: '#94A3B8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              Traditional repository tools
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 24px 0' }}>
              Storage and workflow management
            </h3>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {traditional.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Check size={11} color="#94A3B8" />
                  </div>
                  <span style={{ fontSize: 14, color: '#64748B', lineHeight: 1.55 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SEIS */}
          <div
            style={{
              background: '#FFFFFF',
              border: '2px solid #2563EB',
              borderRadius: 14,
              padding: '32px 28px',
              position: 'relative',
            }}
          >
            {/* Label */}
            <div
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: '#2563EB',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                padding: '3px 10px',
                borderRadius: 6,
              }}
            >
              Intelligence Layer
            </div>

            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: '#2563EB',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              SEIS AI Copilot
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 24px 0' }}>
              Understanding and engineering intelligence
            </h3>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {seis.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#DBEAFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Check size={11} color="#2563EB" />
                  </div>
                  <span style={{ fontSize: 14, color: '#0F172A', fontWeight: 500, lineHeight: 1.55 }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}
