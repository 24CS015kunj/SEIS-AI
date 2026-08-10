import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';
import GithubIcon from './GithubIcon';

export default function AuthModal({ isOpen, onClose, mode = 'github' }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleConnect = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1800);
    }, 1200);
  };

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
          maxWidth: 440,
          width: '100%',
          padding: '36px 32px',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
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

        {/* Logo */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1" fill="#60A5FA" />
            <rect x="10" y="2" width="6" height="6" rx="1" fill="#3B82F6" opacity="0.6" />
            <rect x="2" y="10" width="6" height="6" rx="1" fill="#3B82F6" opacity="0.4" />
            <rect x="10" y="10" width="6" height="6" rx="1" fill="#60A5FA" opacity="0.8" />
          </svg>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: '#F0FDF4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={26} color="#10B981" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
              GitHub Connected!
            </h3>
            <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>
              Redirecting to your workspace...
            </p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              {mode === 'github' ? 'Connect your GitHub account' : 'Welcome to SEIS AI'}
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 28px', lineHeight: 1.6 }}>
              Analyze any repository and start understanding your codebase in minutes.
            </p>

            {/* Primary action */}
            <button
              onClick={handleConnect}
              disabled={loading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                height: 50,
                background: '#0F172A',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 10,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                fontFamily: 'var(--font-sans)',
                marginBottom: 16,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#1E293B')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = '#0F172A')}
            >
              <GithubIcon className="w-5 h-5" />
              {loading ? 'Connecting...' : 'Continue with GitHub'}
            </button>

            {/* Security note */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <ShieldCheck size={16} color="#10B981" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>
                    Read-only repository access
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.55 }}>
                    SEIS only reads repository structure, commit history and file metadata. Your code never leaves GitHub.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
              By continuing, you agree to our{' '}
              <a href="#" style={{ color: '#64748B', textDecoration: 'underline' }}>Terms</a>
              {' '}and{' '}
              <a href="#" style={{ color: '#64748B', textDecoration: 'underline' }}>Privacy Policy</a>.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
