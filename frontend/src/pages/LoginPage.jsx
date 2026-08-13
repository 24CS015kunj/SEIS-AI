import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  UserCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  TrendingUp,
} from 'lucide-react';
import GithubIcon from '../components/common/GithubIcon';
import FadeIn from '../components/common/FadeIn';
import BrandMark, { BrandGlyph } from '../components/common/BrandMark';

const trustPoints = [
  {
    icon: ShieldCheck,
    title: 'Secure GitHub OAuth Authentication',
    desc: 'Your data is protected with industry-standard security.',
  },
  {
    icon: Lock,
    title: 'No Password Required',
    desc: 'Use your GitHub identity to sign in securely.',
  },
  {
    icon: UserCheck,
    title: 'Repository Access Permission',
    desc: 'You choose which repositories to connect and analyze.',
  },
];

const footerLinks = [
  { label: 'Documentation', href: '#' },
  { label: 'GitHub', href: 'https://github.com', external: true },
  { label: 'Support', href: '#' },
  { label: 'Privacy Policy', href: '#' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  // default | loading | error | success
  const [status, setStatus] = useState('default');

  /**
   * MOCK / FRONTEND-ONLY AUTH FLOW.
   * No real GitHub OAuth call happens here — this only drives the four UI
   * states requested for this phase. `?mockAuth=error` forces the very first
   * attempt down the error path (for demoing/testing the error + retry UI);
   * every retry always resolves to success, regardless of the param.
   * On success, this mock now hands off to the Workspace Creation route
   * (frontend navigation only — still no real session/auth is established).
   * Wiring this to the real OAuth redirect/callback is a later phase.
   *
   * `isRetry` is passed explicitly (rather than tracked in state) to avoid a
   * stale-closure bug: a state update from the same click that triggers this
   * call would not yet be visible to this closure's `useState` value.
   */
  const handleConnect = (isRetry = false) => {
    if (status === 'loading') return; // guard against duplicate clicks

    const forceError =
      !isRetry &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mockAuth') === 'error';

    setStatus('loading');
    window.setTimeout(() => {
      if (forceError) {
        setStatus('error');
      } else {
        setStatus('success');
        window.setTimeout(() => navigate('/workspace'), 1400);
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col lg:flex-row">
      {/* ---------- Left panel: marketing + product preview (desktop only) ---------- */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden border-r border-[#E2E8F0]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative w-full flex flex-col justify-center px-16 xl:px-20 py-16">
          <div className="max-w-[460px]">
            <FadeIn>
              <Link
                to="/"
                className="inline-flex items-center gap-2.5 mb-12 group"
                style={{ textDecoration: 'none' }}
                aria-label="SEIS AI Copilot — back to homepage"
              >
                <BrandMark size={40} />
                <span className="text-[16px] font-extrabold text-slate-900 tracking-tight">
                  SEIS AI Copilot
                </span>
              </Link>

              <h1 className="headline-lg mb-6">
                Understand Software Projects with{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  AI
                </span>
              </h1>
              <p className="body-base mb-10 max-w-[420px]">
                Connect your GitHub account to securely import repositories, analyze
                architecture, and unlock AI-powered engineering intelligence.
              </p>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="app-window bg-white">
                <div className="app-titlebar bg-white">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                  </div>
                </div>
                <div className="p-5 bg-[#F8FAFC]">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white rounded-lg border border-[#E2E8F0] p-3">
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">Code Health</div>
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-bold text-slate-900">94%</span>
                        <TrendingUp size={13} className="text-emerald-500" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-[#E2E8F0] p-3">
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">Active PRs</div>
                      <div className="text-lg font-bold text-slate-900">12</div>
                    </div>
                    <div className="bg-white rounded-lg border border-[#E2E8F0] p-3">
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">Tech Debt</div>
                      <div className="text-lg font-bold text-slate-900">A-</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <BrandGlyph size={16} tone="onLight" />
                    </div>
                    <p className="text-[12.5px] text-slate-500 leading-snug m-0">
                      "Authentication is the most frequently modified module this month."
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ---------- Right panel: login card ---------- */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center px-6 py-14 sm:py-16">
          <div className="w-full max-w-[448px]">

            {/* Mobile-only compact brand header (left panel is hidden below lg) */}
            <Link
              to="/"
              className="lg:hidden flex items-center justify-center gap-2.5 mb-8"
              style={{ textDecoration: 'none' }}
              aria-label="SEIS AI Copilot — back to homepage"
            >
              <BrandMark size={34} />
              <span className="text-[15px] font-extrabold text-slate-900 tracking-tight">
                SEIS AI Copilot
              </span>
            </Link>

            <FadeIn direction="scale">
              <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] px-7 py-10 sm:px-[57px] sm:py-[57px]">

                {status === 'error' && (
                  <ErrorState onRetry={() => handleConnect(true)} />
                )}

                {status === 'success' && (
                  <SuccessState />
                )}

                {(status === 'default' || status === 'loading') && (
                  <DefaultState status={status} onConnect={handleConnect} />
                )}

              </div>
            </FadeIn>

            <p className="text-center text-[11px] text-slate-400 mt-6 lg:hidden">
              Having trouble?{' '}
              <a href="#" style={{ color: '#64748B', textDecoration: 'underline' }}>
                Contact support
              </a>
            </p>
          </div>
        </div>

        {/* ---------- Footer ---------- */}
        <footer className="border-t border-[#E2E8F0] px-6 py-6">
          <div className="max-w-[900px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-400">
              © 2026 AI-Powered Software Evolution Intelligence System (SEIS AI Copilot)
            </span>
            <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {footerLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="text-[13px] text-slate-500 hover:text-slate-900 transition-colors no-underline"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DefaultState({ status, onConnect }) {
  const loading = status === 'loading';
  return (
    <>
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
        <BrandGlyph size={28} tone="onLight" />
      </div>

      <h2 className="text-[22px] sm:text-2xl font-bold text-slate-900 text-center mb-2 leading-snug">
        Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">SEIS AI Copilot</span>
      </h2>
      <p className="text-sm text-slate-500 text-center leading-relaxed mb-8 max-w-[340px] mx-auto">
        Connect your GitHub account to securely import repositories, analyze
        software projects, and unlock AI-powered engineering intelligence.
      </p>

      <button
        type="button"
        onClick={() => onConnect()}
        disabled={loading}
        aria-busy={loading}
        className="w-full h-14 inline-flex items-center justify-center gap-2.5 bg-[#0F172A] text-white text-[15px] font-semibold rounded-xl border-0 cursor-pointer transition-colors hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-80 mb-8"
      >
        {loading ? (
          <>
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            Connecting to GitHub…
          </>
        ) : (
          <>
            <GithubIcon className="w-5 h-5" />
            Continue with GitHub
          </>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? 'Connecting to GitHub, please wait.' : ''}
      </span>

      <div className="flex flex-col gap-5 mb-8">
        {trustPoints.map((point) => {
          const Icon = point.icon;
          return (
            <div key={point.title} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={13} className="text-blue-600" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold text-slate-900 leading-snug">
                  {point.title}
                </div>
                <div className="text-[13px] text-slate-500 leading-snug">{point.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-slate-400 text-center leading-relaxed m-0">
        By continuing, you agree to our{' '}
        <a href="#" className="text-slate-600 underline hover:text-slate-900">Terms of Service</a>
        {' '}and{' '}
        <a href="#" className="text-slate-600 underline hover:text-slate-900">Privacy Policy</a>.
      </p>
    </>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div role="alert" aria-live="assertive">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-6">
        <AlertTriangle size={28} className="text-rose-500" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
        Unable to Connect to GitHub
      </h2>
      <p className="text-sm text-slate-500 text-center leading-relaxed mb-8 max-w-[320px] mx-auto">
        Unable to connect to GitHub. Please check your connection and try again.
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="w-full h-14 inline-flex items-center justify-center gap-2.5 bg-[#0F172A] text-white text-[15px] font-semibold rounded-xl border-0 cursor-pointer transition-colors hover:bg-[#1E293B] mb-6"
      >
        <RotateCw size={18} aria-hidden="true" />
        Try Again
      </button>

      <p className="text-[12px] text-slate-400 text-center leading-relaxed m-0">
        Still having trouble?{' '}
        <a href="#" className="text-slate-600 underline hover:text-slate-900">Contact support</a>
      </p>
    </div>
  );
}

function SuccessState() {
  return (
    <div role="status" aria-live="polite" className="py-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 size={30} className="text-emerald-500" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
        GitHub Connected!
      </h2>
      <p className="text-sm text-slate-500 text-center leading-relaxed mb-2">
        Redirecting to your workspace…
      </p>
      <div className="flex items-center justify-center pt-4">
        <Loader2 size={22} className="animate-spin text-slate-300" aria-hidden="true" />
      </div>
    </div>
  );
}
