import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Lock, 
  UserCheck, 
  Loader2, 
  TrendingUp, 
  CheckCircle2, 
  ArrowRight, 
  LogOut, 
  Mail, 
  ExternalLink, 
  AlertCircle 
} from 'lucide-react';
import GithubIcon from '../components/common/GithubIcon';
import FadeIn from '../components/common/FadeIn';
import BrandMark, { BrandGlyph } from '../components/common/BrandMark';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/apiClient';

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
  const { user, status: authStatus, logout } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [switchNotice, setSwitchNotice] = useState(false);

  /**
   * Real GitHub OAuth handoff: a full browser navigation to Express's
   * existing `GET /api/auth/github`, which redirects to GitHub. The
   * frontend never talks to GitHub directly and never sees a client secret.
   * This tab unloads immediately after, so `connecting` only covers the
   * brief moment before that navigation happens.
   */
  const handleConnect = () => {
    if (connecting) return;
    setConnecting(true);
    window.location.href = `${API_BASE_URL}/api/auth/github`;
  };

  const handleConfirmContinue = () => {
    setConfirming(true);
    navigate('/workspace');
  };

  const handleSwitchAccount = async () => {
    setSwitchNotice(true);
    await logout();
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
              <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] px-7 py-9 sm:px-[48px] sm:py-[48px]">
                {authStatus === 'loading' ? (
                  <VerifyingState />
                ) : authStatus === 'authenticated' && user ? (
                  <AccountConfirmationState
                    user={user}
                    onConfirm={handleConfirmContinue}
                    onSwitchAccount={handleSwitchAccount}
                    confirming={confirming}
                  />
                ) : (
                  <DefaultState
                    status={connecting ? 'loading' : 'default'}
                    onConnect={handleConnect}
                    switchNotice={switchNotice}
                  />
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

function VerifyingState() {
  return (
    <div className="py-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
        <BrandGlyph size={26} tone="onLight" />
      </div>
      <div className="inline-flex items-center gap-2 mb-2">
        <Loader2 size={18} className="animate-spin text-blue-600" />
        <h3 className="text-lg font-bold text-slate-900 m-0">Verifying session...</h3>
      </div>
      <p className="text-sm text-slate-500 max-w-[280px] mx-auto m-0">
        Connecting with GitHub and validating your security token.
      </p>
    </div>
  );
}

function AccountConfirmationState({ user, onConfirm, onSwitchAccount, confirming }) {
  const avatar = user?.avatarUrl;
  const username = user?.githubUsername || 'Developer';
  const name = user?.name || username;
  const email = user?.email;
  const publicRepos = user?.publicRepos ?? 0;
  const followers = user?.followers ?? 0;
  const profileUrl = user?.githubProfileUrl || `https://github.com/${username}`;

  return (
    <div>
      {/* Top verified badge */}
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-[12px] font-semibold tracking-wide">
          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
          <span>GitHub Authorization Successful</span>
        </div>
      </div>

      <h2 className="text-[21px] sm:text-[23px] font-bold text-slate-900 text-center mb-1 leading-snug">
        Confirm Your Account
      </h2>
      <p className="text-[13.5px] text-slate-500 text-center leading-relaxed mb-6 max-w-[340px] mx-auto">
        You are signing in to SEIS AI Copilot. Confirm your GitHub account details below to enter your workspace.
      </p>

      {/* Account Profile Card */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 sm:p-5 mb-5 shadow-xs">
        <div className="flex items-center gap-3.5 mb-3.5">
          <div className="relative shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="w-13 h-13 rounded-full object-cover border-2 border-white shadow-xs"
              />
            ) : (
              <div className="w-13 h-13 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-base">
                {username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-200"
              title="Active GitHub Session"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold text-slate-900 truncate">
                {name}
              </span>
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-mono hover:underline"
                title="View GitHub Profile"
              >
                @{username}
                <ExternalLink size={10} />
              </a>
            </div>

            <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-1 truncate">
              <Mail size={12} className="text-slate-400 shrink-0" />
              <span className="truncate">{email || 'Email private on GitHub'}</span>
            </div>
          </div>
        </div>

        {/* Metadata stats pill row */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#E2E8F0] text-center">
          <div className="bg-white rounded-lg py-1 px-2 border border-slate-200/60">
            <span className="text-[10.5px] text-slate-400 block font-medium">Repositories</span>
            <span className="text-[13px] font-bold text-slate-800 font-mono">{publicRepos}</span>
          </div>
          <div className="bg-white rounded-lg py-1 px-2 border border-slate-200/60">
            <span className="text-[10.5px] text-slate-400 block font-medium">Followers</span>
            <span className="text-[13px] font-bold text-slate-800 font-mono">{followers}</span>
          </div>
        </div>
      </div>

      {/* Permission scope notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50/70 border border-blue-100/90 mb-6 text-[12px] text-blue-900 leading-snug">
        <ShieldCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Read-Only Scope:</span> SEIS AI only accesses repositories and metadata you explicitly choose to import.
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2.5 mb-5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="btn-apple-primary w-full h-11 text-[14px] rounded-lg gap-2 font-semibold shadow-xs cursor-pointer flex items-center justify-center transition-all"
        >
          {confirming ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Entering Workspace…</span>
            </>
          ) : (
            <>
              <span>Confirm & Continue to Workspace</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSwitchAccount}
          disabled={confirming}
          className="w-full h-10 text-[13px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <LogOut size={14} className="text-slate-500" />
          <span>Switch Account / Sign Out</span>
        </button>
      </div>

      <div className="text-center">
        <Link
          to="/"
          className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors no-underline inline-flex items-center gap-1"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  );
}

function DefaultState({ status, onConnect, switchNotice }) {
  const loading = status === 'loading';
  return (
    <>
      {switchNotice && (
        <div className="mb-6 p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 text-[12px] leading-relaxed">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            Signed out of SEIS AI
          </div>
          <p className="m-0 mb-1">
            You can now connect a different GitHub account.
          </p>
          <p className="text-[11px] text-amber-800 m-0">
            Note: If your browser is still logged into your previous account at GitHub,{' '}
            <a
              href="https://github.com/logout"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold hover:text-amber-950 inline-flex items-center gap-0.5"
            >
              sign out of GitHub.com
              <ExternalLink size={9} />
            </a>{' '}
            before reconnecting.
          </p>
        </div>
      )}

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
        className="btn-dev-primary w-full h-12 text-[14.5px] rounded-lg gap-2.5 mb-8"
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
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

