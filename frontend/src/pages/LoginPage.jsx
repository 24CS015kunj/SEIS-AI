import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Lock, 
  UserCheck, 
  Loader2, 
  CheckCircle2, 
  ArrowRight, 
  LogOut, 
  Mail, 
  ExternalLink, 
  AlertCircle 
} from 'lucide-react';
import GithubIcon from '../components/common/GithubIcon';
import FadeIn from '../components/common/FadeIn';
import { BrandGlyph } from '../components/common/BrandMark';
import InteractiveRobot from '../components/common/InteractiveRobot';
import { useAuth } from '../context/AuthContext';
import {
  API_BASE_URL,
  getStayLoggedInPreference,
  setStayLoggedInPreference,
  getAuthToken,
  setAuthToken,
} from '../services/apiClient';

const trustPoints = [
  {
    icon: ShieldCheck,
    title: 'Secure GitHub Authentication',
    desc: 'Sign in securely using GitHub OAuth.',
  },
  {
    icon: Lock,
    title: 'No Password Required',
    desc: 'Authenticate with your GitHub account. SEIS never asks for your GitHub password.',
  },
  {
    icon: UserCheck,
    title: 'You Control Repository Access',
    desc: 'Choose which repositories to connect and analyze, within the permissions you authorize.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, status: authStatus, logout } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [switchNotice, setSwitchNotice] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(() => getStayLoggedInPreference());
  const showAccountConfirmation = authStatus === 'authenticated' && Boolean(user);

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
    setStayLoggedInPreference(stayLoggedIn);
    window.location.href = `${API_BASE_URL}/api/auth/github?stayLoggedIn=${stayLoggedIn}`;
  };

  const handleConfirmContinue = () => {
    setConfirming(true);
    const token = getAuthToken();
    if (token) {
      setAuthToken(token, stayLoggedIn);
    }
    navigate('/workspace');
  };

  const handleSwitchAccount = async () => {
    setSwitchNotice(true);
    await logout();
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-(--seis-canvas) lg:flex-row">
      {/* ---------- Left panel: product overview and security scope ---------- */}
      <div className="relative hidden overflow-hidden border-r border-(--seis-border-subtle) bg-(--seis-surface-1) lg:flex lg:min-h-screen lg:w-[46%] lg:shrink-0">
        <div className="seis-engineering-grid" aria-hidden="true" />
        <div className="relative z-10 flex w-full flex-col justify-center px-8 py-12 xl:px-14 2xl:px-16">
          <div className="mx-auto w-full max-w-130 font-sans">
            <FadeIn>
              <Link
                to="/"
                className="group mb-10 inline-flex items-center gap-2 no-underline"
                aria-label="SEIS-AI — back to homepage"
              >
                <img
                  src="/logo.jpeg"
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-(--seis-cyan)/40 object-cover"
                />
                <span className="font-mono text-[15px] font-bold text-(--seis-text-primary) tracking-tight">
                  SEIS-AI
                </span>
                <span className="badge-tag ml-1">V2.4</span>
              </Link>

              <h1 className="mb-5 text-[2.6rem] font-extrabold leading-[1.08] tracking-[-0.035em] text-(--seis-text-primary) xl:text-[3.25rem]">
                Software Evolution Intelligence,
                <span className="block text-(--seis-cyan)">Powered by AI.</span>
              </h1>
              <p className="mb-8 max-w-130 text-[16px] leading-[1.75] text-(--seis-text-secondary)">
                Connect your GitHub account to understand repository architecture, visualize
                AST-based dependencies, identify code churn hotspots, and explore your codebase
                with AI-powered explanations grounded in source citations.
              </p>
            </FadeIn>

            <FadeIn delay={100}>
              <div className="space-y-4 rounded-xl border border-(--seis-border-subtle) bg-(--seis-surface-2) p-5 font-sans shadow-sm xl:p-6">
                <div className="border-b border-(--seis-border-subtle) pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-(--seis-text-muted)">
                  INGESTION &amp; SECURITY
                </div>
                <div className="flex items-start gap-3 text-[13.5px] leading-[1.65] text-(--seis-text-secondary)">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-(--seis-cyan)" />
                  <div>
                    <strong className="text-(--seis-text-primary) font-semibold">Read-Only Access:</strong> Import repository files and commit history within the permissions you authorize.
                  </div>
                </div>
                <div className="flex items-start gap-3 text-[13.5px] leading-[1.65] text-(--seis-text-secondary)">
                  <Lock size={17} className="mt-0.5 shrink-0 text-(--seis-cyan)" />
                  <div>
                    <strong className="text-(--seis-text-primary) font-semibold">Privacy by Design:</strong> Your source code is analyzed for software intelligence and is not used to train AI models.
                  </div>
                </div>
                <div className="flex items-start gap-3 text-[13.5px] leading-[1.65] text-(--seis-text-secondary)">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-(--seis-cyan)" />
                  <div>
                    <strong className="text-(--seis-text-primary) font-semibold">Grounded AI Insights:</strong> Get codebase explanations supported by source references and line numbers.
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ---------- Right panel: login card ---------- */}
      <div className="flex min-h-screen flex-1 flex-col bg-(--seis-canvas) lg:w-[54%] lg:flex-none">
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:py-14 lg:px-8 lg:py-8 xl:px-12">
          <div className={`w-full ${showAccountConfirmation ? 'max-w-lg' : 'max-w-md'}`}>

            {/* Mobile-only compact brand header (left panel is hidden below lg) */}
            <Link
              to="/"
              className="lg:hidden flex items-center justify-center gap-2.5 mb-8 no-underline"
              aria-label="SEIS-AI — back to homepage"
            >
              <img
                src="/logo.jpeg"
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-(--seis-cyan)/40 object-cover"
              />
              <span className="font-mono text-[15px] font-bold text-(--seis-text-primary) tracking-tight">
                SEIS-AI
              </span>
            </Link>

            <FadeIn direction="scale">
              <div
                className={`border border-(--seis-border-subtle) bg-(--seis-surface-1) shadow-sm ${
                  showAccountConfirmation
                    ? 'rounded-2xl border-t-2 border-t-(--seis-cyan) px-6 py-7 shadow-slate-900/5 sm:px-9 sm:py-8'
                    : 'rounded-lg px-7 py-9 sm:px-11 sm:py-11'
                }`}
              >
                {authStatus === 'loading' ? (
                  <VerifyingState />
                ) : authStatus === 'authenticated' && user ? (
                  <AccountConfirmationState
                    user={user}
                    onConfirm={handleConfirmContinue}
                    onSwitchAccount={handleSwitchAccount}
                    confirming={confirming}
                    stayLoggedIn={stayLoggedIn}
                    onToggleStayLoggedIn={(val) => {
                      setStayLoggedIn(val);
                      setStayLoggedInPreference(val);
                    }}
                  />
                ) : (
                  <DefaultState
                    status={connecting ? 'loading' : 'default'}
                    onConnect={handleConnect}
                    switchNotice={switchNotice}
                    stayLoggedIn={stayLoggedIn}
                    onToggleStayLoggedIn={(val) => {
                      setStayLoggedIn(val);
                      setStayLoggedInPreference(val);
                    }}
                  />
                )}
              </div>
            </FadeIn>

            <p className="text-center text-[11px] text-(--seis-text-muted) mt-6 lg:hidden font-mono">
              Need assistance?{' '}
              <a href="#" className="text-(--seis-text-secondary) underline hover:text-(--seis-text-primary)">
                Contact support
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

function VerifyingState() {
  return (
    <div className="py-10 text-center font-mono">
      <div className="w-12 h-12 rounded bg-(--seis-surface-2) border border-(--seis-border-subtle) flex items-center justify-center mx-auto mb-4">
        <BrandGlyph size={24} tone="neutral" />
      </div>
      <div className="inline-flex items-center gap-2 mb-2">
        <Loader2 size={16} className="animate-spin text-blue-500" />
        <h3 className="text-base font-bold text-(--seis-text-primary) m-0">
          Verifying session...
        </h3>
      </div>
      <p className="text-xs text-(--seis-text-muted) max-w-70 mx-auto m-0">
        Validating GitHub identity against session token store.
      </p>
    </div>
  );
}

function AccountConfirmationState({
  user,
  onConfirm,
  onSwitchAccount,
  confirming,
  stayLoggedIn,
  onToggleStayLoggedIn,
}) {
  const avatar = user?.avatarUrl;
  const username = user?.githubUsername || 'Developer';
  const name = user?.name || username;
  const email = user?.email;
  const publicRepos = user?.publicRepos ?? 0;
  const followers = user?.followers ?? 0;
  const profileUrl = user?.githubProfileUrl || `https://github.com/${username}`;

  return (
    <div className="font-sans">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>GitHub account connected</span>
        </div>
        <span className="font-mono text-[10px] font-medium tracking-wider text-(--seis-text-muted)">
          FINAL STEP
        </span>
      </div>

      <div className="mb-5">
        <h2 className="mb-1.5 font-sans text-[24px] font-bold leading-tight tracking-tight text-(--seis-text-primary) sm:text-[26px]">
          Confirm your account
        </h2>
        <p className="max-w-100 font-sans text-[13px] leading-relaxed text-(--seis-text-secondary)">
          Make sure this is the GitHub account you want to use with SEIS AI Copilot.
        </p>
      </div>

      <section
        aria-label="Connected GitHub account"
        className="mb-4 rounded-xl border border-(--seis-border-subtle) bg-(--seis-surface-2) p-4 sm:p-5"
      >
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt={`${name}'s GitHub avatar`}
                className="h-14 w-14 rounded-full border-2 border-(--seis-surface-1) object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-(--seis-surface-1) bg-(--seis-cyan-subtle) font-sans text-base font-bold text-(--seis-cyan-deep) shadow-sm dark:text-(--seis-cyan)">
                {username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span
              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-(--seis-surface-2) bg-emerald-500"
              title="GitHub account connected"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-sans text-[15px] font-bold text-(--seis-text-primary)">
                {name}
              </span>
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-(--seis-cyan-deep) hover:underline dark:text-(--seis-cyan)"
                title="View GitHub profile"
              >
                @{username}
                <ExternalLink size={10} aria-hidden="true" />
              </a>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 font-sans text-[11px] text-(--seis-text-muted)">
              <Mail size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{email || 'Email private on GitHub'}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 border-t border-(--seis-border-subtle) pt-3.5">
          <div className="border-r border-(--seis-border-subtle) text-center">
            <span className="mb-0.5 block font-sans text-[10px] font-medium text-(--seis-text-muted)">Public repositories</span>
            <span className="font-sans text-[14px] font-bold tabular-nums text-(--seis-text-primary)">{publicRepos}</span>
          </div>
          <div className="text-center">
            <span className="mb-0.5 block font-sans text-[10px] font-medium text-(--seis-text-muted)">Followers</span>
            <span className="font-sans text-[14px] font-bold tabular-nums text-(--seis-text-primary)">{followers}</span>
          </div>
        </div>
      </section>

      <div className="mb-3.5 flex items-start gap-2.5 rounded-lg border border-(--seis-cyan)/20 bg-(--seis-cyan-subtle) p-3 font-sans text-[11.5px] leading-relaxed text-(--seis-text-secondary)">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-(--seis-cyan-deep) dark:text-(--seis-cyan)" aria-hidden="true" />
        <div>
          <strong className="font-semibold text-(--seis-text-primary)">You stay in control.</strong>{' '}
          SEIS AI uses read-only access and only analyzes repositories you choose to import.
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-(--seis-border-subtle) bg-(--seis-surface-1) p-3.5 text-left">
        <label className="flex cursor-pointer select-none items-start gap-3">
          <input
            type="checkbox"
            id="stay-logged-in-confirm"
            checked={stayLoggedIn}
            onChange={(e) => onToggleStayLoggedIn?.(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-(--seis-cyan)"
          />
          <div className="min-w-0">
            <div className="font-sans text-[12px] font-semibold leading-snug text-(--seis-text-primary)">
              Stay logged in on this device
            </div>
            <div className="mt-0.5 font-sans text-[11px] leading-snug text-(--seis-text-muted)">
              Keep your session active between visits.
            </div>
          </div>
        </label>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="btn-tool-primary flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg font-sans text-[13px] font-semibold transition-all disabled:cursor-wait disabled:opacity-70"
        >
          {confirming ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Entering Workspace…</span>
            </>
          ) : (
            <>
              <span>Continue to your workspace</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSwitchAccount}
          disabled={confirming}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-(--seis-border-subtle) bg-transparent font-sans text-[12px] font-medium text-(--seis-text-secondary) transition-colors hover:bg-(--seis-surface-2) disabled:cursor-wait disabled:opacity-70"
        >
          <LogOut size={13} className="text-(--seis-text-muted)" />
          <span>Use a different GitHub account</span>
        </button>
      </div>

      <div className="text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1 font-sans text-[11.5px] text-(--seis-text-muted) no-underline transition-colors hover:text-(--seis-text-primary)"
        >
          &larr; Back to SEIS home
        </Link>
      </div>
    </div>
  );
}

function DefaultState({
  status,
  onConnect,
  switchNotice,
  stayLoggedIn,
  onToggleStayLoggedIn,
}) {
  const loading = status === 'loading';
  return (
    <>
      {switchNotice && (
        <div className="mb-6 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[12px] leading-relaxed font-mono">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            Session Terminated
          </div>
          <p className="m-0 mb-1 text-[11.5px]">
            Previous session closed. Select account to establish new connection.
          </p>
          <p className="text-[10.5px] m-0 text-amber-800 dark:text-amber-300">
            Note: If your browser is still signed into GitHub,{' '}
            <a
              href="https://github.com/logout"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold hover:opacity-80 inline-flex items-center gap-0.5"
            >
              sign out of GitHub.com
              <ExternalLink size={9} />
            </a>{' '}
            before reconnecting.
          </p>
        </div>
      )}

      <div
        className="relative mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-cyan-500/20 bg-[radial-gradient(circle,rgba(34,211,238,0.12),transparent_72%)]"
        aria-hidden="true"
      >
        <span className="absolute inset-2 rounded-full border border-dashed border-cyan-500/20" />
        <span className="relative z-10 motion-safe:animate-[robotBobMaster_5s_ease-in-out_infinite]">
          <InteractiveRobot size={76} interactive={false} showChatBubble={false} />
        </span>
      </div>

      <h2 className="text-[19px] font-bold text-(--seis-text-primary) text-center mb-1.5 leading-snug tracking-tight font-mono">
        Connect Your GitHub
      </h2>
      <p className="text-[12.5px] text-(--seis-text-secondary) text-center leading-relaxed mb-6 max-w-85 mx-auto">
        Authorize SEIS AI Copilot to analyze your repositories and build an intelligent view of your software architecture.
      </p>

      {/* Stay logged in option */}
      <div className="mb-5 p-3 rounded border border-(--seis-border-subtle) bg-(--seis-surface-2) text-left">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            id="stay-logged-in-login"
            checked={stayLoggedIn}
            onChange={(e) => onToggleStayLoggedIn?.(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded border-(--seis-border-strong) accent-blue-600 cursor-pointer shrink-0"
          />
          <div className="min-w-0">
            <span className="text-[12px] font-semibold text-(--seis-text-primary) block leading-tight font-mono">
              Keep me signed in on this device
            </span>
            <span className="text-[11px] text-(--seis-text-muted) block leading-tight mt-1">
              Maintain your session across browser restarts.
            </span>
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={() => onConnect()}
        disabled={loading}
        aria-busy={loading}
        className="btn-tool-primary w-full h-11 text-[13px] font-mono font-semibold rounded gap-2.5 mb-6 flex items-center justify-center cursor-pointer transition-all"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Connecting to GitHub…
          </>
        ) : (
          <>
            <GithubIcon className="w-4 h-4" />
            Continue with GitHub
          </>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? 'Connecting to GitHub, please wait.' : ''}
      </span>

      <div className="flex flex-col gap-3.5 mb-6 border-t border-(--seis-border-subtle) pt-5">
        {trustPoints.map((point) => {
          const Icon = point.icon;
          return (
            <div key={point.title} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded bg-(--seis-surface-2) border border-(--seis-border-subtle) flex items-center justify-center shrink-0 mt-0.5 text-blue-500">
                <Icon size={12} aria-hidden="true" />
              </div>
              <div>
                <div className="text-[12px] font-mono font-semibold text-(--seis-text-primary) leading-snug">
                  {point.title}
                </div>
                <div className="text-[11.5px] text-(--seis-text-muted) leading-snug">{point.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] font-mono text-(--seis-text-muted) text-center leading-relaxed m-0">
        By connecting, you agree to the SEIS AI Copilot Terms of Service and Privacy Policy.
      </p>
    </>
  );
}
