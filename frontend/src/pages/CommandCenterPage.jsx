import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, SearchX } from 'lucide-react';
import { getRepositoryDashboard, getRepositoryAnalysis, generateRepositoryAnalysis, getRepositoryCommits } from '../services/repositoryService';
import { useRepositoryIdentity } from '../hooks/useRepositoryIdentity';
import { useRepositoryHeader, formatRelativeTime } from '../hooks/useRepositoryHeader';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import OverviewMetrics from '../components/commandCenter/OverviewMetrics';
import RepositoryHealthCard from '../components/commandCenter/RepositoryHealthCard';
import RepositoryActivitySection from '../components/commandCenter/RepositoryActivitySection';
import EngineeringHotspotsSection from '../components/commandCenter/EngineeringHotspotsSection';
import TechStackStrip from '../components/commandCenter/TechStackStrip';
import AiInsightsPanel from '../components/commandCenter/AiInsightsPanel';
import ArchitectureSection from '../components/commandCenter/ArchitectureSection';
import ActivitySection from '../components/commandCenter/ActivitySection';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';
import FileCodePreviewDrawer from '../components/common/FileCodePreviewDrawer';
import EngineeringBackground from '../components/common/EngineeringBackground';
import EmptyRepositoryState from '../components/common/EmptyRepositoryState';

/** No repository-specific suggested-question generation exists anywhere in
 * this codebase (confirmed by inspection) -- this is a fixed set of
 * generic prompts to try, not a claim about this repository's contents,
 * same as Task 57's identical choice for Source Control's Copilot drawer. */
const SUGGESTED_QUESTIONS = [
  'What does this repository do?',
  'Which files make up the core logic?',
  'Summarize the architecture in plain English.',
  'Where should I start reading this codebase?',
];

export default function CommandCenterPage() {
  // Task 71: `repositoryId` is the URL's own `:repositoryId` param, the
  // single source of truth for repository identity -- it survives a
  // refresh and a direct/pasted link, unlike the old
  // `location.state.repo` pattern. `key={repositoryId}` on the returned
  // tree below forces a full remount (fresh state everywhere: selected
  // module, open Copilot conversation, retry counters) whenever the
  // active repository actually changes, rather than auditing every
  // individual `useState` for staleness one at a time.
  const { repositoryId } = useParams();
  return <CommandCenterPageContent key={repositoryId ?? 'none'} repositoryId={repositoryId} />;
}

function CommandCenterPageContent({ repositoryId }) {
  const identity = useRepositoryIdentity(repositoryId);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [previewFilePath, setPreviewFilePath] = useState(null);

  // Task 68: real, aggregated Dashboard data from
  // `GET /api/github/repositories/:repositoryId/dashboard`. Every section
  // carries its own `available` flag from the backend -- this page never
  // falls back to mock data on a failed/empty response, only an honest
  // loading/error/empty state (instruction "Do not silently fall back to
  // mock data").
  const [dashboardStatus, setDashboardStatus] = useState('idle'); // idle | loading | ready | error
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState(null);

  // `dashboardRetryNonce` exists only so the error state's Retry button
  // (Task 70 audit finding: this fetch previously had no recovery action
  // at all besides a full page reload) can re-trigger this effect without
  // duplicating its fetch logic.
  const [dashboardRetryNonce, setDashboardRetryNonce] = useState(0);

  // Only fetch the (heavier) dashboard aggregation once identity has
  // actually resolved to a real, owned repository -- an invalid/not-found
  // id must never reach this call at all.
  const identityReady = identity.status === 'ready';

  useEffect(() => {
    if (!identityReady) {
      setDashboardStatus('idle');
      setDashboardData(null);
      setDashboardError(null);
      return;
    }
    let cancelled = false;
    setDashboardStatus('loading');
    setDashboardError(null);
    getRepositoryDashboard(repositoryId)
      .then((data) => {
        if (cancelled) return;
        setDashboardData(data);
        setDashboardStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setDashboardStatus('error');
        setDashboardError(
          err.response?.data?.message || 'Failed to load repository dashboard data. Please try again.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady, dashboardRetryNonce]);

  // CommandCenterHeader/Sidebar expect `{name, owner, branch, status,
  // lastUpdated}`. `identity.repository` (Task 71, real backend data
  // resolved from the URL) is the base identity; the dashboard's own
  // (possibly more current) synced branch is layered on top once it
  // resolves, same fallback chain as before -- now the shared
  // `useRepositoryHeader` derivation (Task 77) instead of a page-local
  // `useMemo`, identical output.
  const headerRepo = useRepositoryHeader(identity, {
    syncStatus: dashboardStatus,
    branchNameOverride: dashboardData?.branch?.name,
    lastFetchedAtOverride: dashboardData?.repository?.lastFetchedAt,
  });

  // Real overview metric cards -- each `value` is either a real number/
  // string or `null` (rendered as "Not available" by OverviewMetrics),
  // never a fabricated placeholder (Task 68 §"do not invent").
  const metrics = useMemo(() => {
    const files = dashboardData?.files;
    const deps = dashboardData?.dependencies;
    const contributors = dashboardData?.contributors;

    return [
      {
        key: 'files',
        label: 'Files',
        value: files?.available ? files.fileCount : null,
        hint: files?.available
          ? `${files.count} total entries synced${files.truncated ? ' (tree truncated by GitHub)' : ''}`
          : 'Sync files from Source Control to see this.',
      },
      {
        key: 'linesOfCode',
        label: 'Lines of Code',
        value: null,
        hint: 'Not calculated -- only file byte size is synced, not line counts.',
      },
      {
        key: 'dependencies',
        label: 'Dependencies',
        value: deps?.available ? deps.count : null,
        hint: deps?.available
          ? `From ${deps.manifestPath} (${deps.ecosystem})`
          : 'No package.json or requirements.txt found at the repository root.',
      },
      {
        key: 'contributors',
        label: 'Contributors',
        value: contributors?.available ? contributors.total : null,
        hint: contributors?.available
          ? contributors.truncated
            ? '100+ contributors on GitHub'
            : 'From real GitHub commit history'
          : 'Not available',
      },
    ];
  }, [dashboardData]);

  const activity = useMemo(() => {
    const commits = dashboardData?.activity?.commits ?? [];
    return commits.map((c) => ({
      id: c.sha,
      message: c.message,
      actor: c.author,
      timestamp: formatRelativeTime(c.committedAt) || 'Unknown time',
    }));
  }, [dashboardData]);

  // Task 69: real repository analysis (AI Insights), fetched and
  // generated independently of the Dashboard's own data -- a failed or
  // slow analysis fetch must never block the rest of the Dashboard from
  // rendering, and generating a fresh analysis is always an explicit user
  // action (the "Generate"/"Re-run" button), never triggered automatically
  // on every page load (Task 69 §"avoid running a full expensive analysis
  // on every dashboard page load").
  const [analysisStatus, setAnalysisStatus] = useState('idle'); // idle | loading | none | ready | error
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisStale, setAnalysisStale] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisGenerating, setAnalysisGenerating] = useState(false);

  useEffect(() => {
    if (!identityReady) {
      setAnalysisStatus('idle');
      setAnalysisData(null);
      setAnalysisStale(false);
      setAnalysisError(null);
      return;
    }
    let cancelled = false;
    setAnalysisStatus('loading');
    setAnalysisError(null);
    getRepositoryAnalysis(repositoryId)
      .then((data) => {
        if (cancelled) return;
        setAnalysisData(data.analysis);
        setAnalysisStale(Boolean(data.stale));
        setAnalysisStatus(data.analysis ? 'ready' : 'none');
      })
      .catch((err) => {
        if (cancelled) return;
        setAnalysisStatus('error');
        setAnalysisError(err.response?.data?.message || 'Failed to load repository analysis.');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady]);

  // Task 95: Real commit history for activity & contribution analytics
  const [commitsStatus, setCommitsStatus] = useState('idle'); // idle | loading | ready | error
  const [branchCommits, setBranchCommits] = useState([]);

  useEffect(() => {
    if (!repositoryId || !dashboardData?.branch?.id) {
      setCommitsStatus('idle');
      setBranchCommits([]);
      return;
    }

    let cancelled = false;
    setCommitsStatus('loading');
    getRepositoryCommits(repositoryId, dashboardData.branch.id, { limit: 100 })
      .then((data) => {
        if (cancelled) return;
        setBranchCommits(data.commits ?? []);
        setCommitsStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setCommitsStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, dashboardData?.branch?.id]);

  const handleGenerateAnalysis = () => {
    if (!repositoryId || analysisGenerating) return;
    setAnalysisGenerating(true);
    setAnalysisError(null);
    generateRepositoryAnalysis(repositoryId)
      .then((data) => {
        setAnalysisData(data.analysis);
        setAnalysisStale(Boolean(data.stale));
        setAnalysisStatus('ready');
      })
      .catch((err) => {
        setAnalysisStatus('error');
        setAnalysisError(err.response?.data?.message || 'Repository analysis failed. Please try again.');
      })
      .finally(() => setAnalysisGenerating(false));
  };

  const showSkeleton = identity.status === 'loading' || dashboardStatus === 'loading';

  return (
    <div className="relative min-h-screen w-full bg-[#F5F6FA] flex">
      <EngineeringBackground />
      <CommandCenterSidebar
        repository={headerRepo}
        repositoryId={identity.status === 'ready' ? repositoryId : null}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <CommandCenterHeader
          repository={headerRepo}
          repositoryId={repositoryId}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCopilot={() => setCopilotOpen(true)}
        />

        <main id="overview" className="flex-1 px-4 sm:px-6 py-6 scroll-mt-14">
          <p className="sr-only" role="status" aria-live="polite">
            {showSkeleton ? 'Loading Command Center dashboard.' : 'Command Center dashboard loaded.'}
          </p>

          {!repositoryId ? (
            <NoRepositoryState />
          ) : identity.status === 'not-found' ? (
            <RepositoryNotFoundState />
          ) : identity.status === 'error' ? (
            <DashboardErrorState message={identity.error} onRetry={() => window.location.reload()} />
          ) : showSkeleton ? (
            <CommandCenterSkeleton />
          ) : dashboardStatus === 'error' ? (
            <DashboardErrorState message={dashboardError} onRetry={() => setDashboardRetryNonce((n) => n + 1)} />
          ) : (
            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start max-w-[1240px] mx-auto">
              <div className="flex flex-col gap-6 min-w-0">
                <section aria-label="Key engineering overview">
                  <OverviewMetrics metrics={metrics} />
                </section>
                {/* Task 92: Repository Health Score — derived from existing AI
                    Insights analysis data (Task 69/74). Only visible once an
                    analysis has been generated; never blocks the rest of the
                    dashboard from rendering (null returned during loading/none). */}
                <RepositoryHealthCard
                  status={analysisStatus === 'idle' ? 'loading' : analysisStatus}
                  analysis={analysisData}
                />
                {/* Task 95: Repository Activity & Contribution Insights */}
                <RepositoryActivitySection
                  commits={branchCommits}
                  dashboardData={dashboardData}
                  loading={commitsStatus === 'loading' && branchCommits.length === 0}
                />
                {/* Repository Engineering Risk & Hotspots */}
                <EngineeringHotspotsSection
                  commits={branchCommits}
                  dashboardData={dashboardData}
                  analysisData={analysisData}
                  loading={commitsStatus === 'loading' && branchCommits.length === 0}
                  onPreviewFile={(path) => setPreviewFilePath(path)}
                />
                <AiInsightsPanel
                  status={analysisStatus === 'idle' ? 'loading' : analysisStatus}
                  analysis={analysisData}
                  stale={analysisStale}
                  generating={analysisGenerating}
                  error={analysisError}
                  onGenerate={handleGenerateAnalysis}
                  onPreviewFile={(path) => setPreviewFilePath(path)}
                />
                <ArchitectureSection
                  available={dashboardData?.architecture?.available ?? false}
                  directories={dashboardData?.architecture?.directories ?? []}
                  rootFileCount={dashboardData?.architecture?.rootFileCount ?? 0}
                />
              </div>

              <div className="flex flex-col gap-6 mt-6 lg:mt-0 min-w-0">
                <TechStackStrip
                  available={dashboardData?.languages?.available ?? false}
                  languages={dashboardData?.languages?.breakdown ?? []}
                />
                <ActivitySection available={dashboardData?.activity?.available ?? false} activity={activity} />
              </div>
            </div>
          )}
        </main>
      </div>

      {copilotOpen && (
        <CopilotDrawer
          repository={headerRepo}
          repositoryId={repositoryId}
          suggestedQuestions={SUGGESTED_QUESTIONS}
          onClose={() => setCopilotOpen(false)}
        />
      )}

      <FileCodePreviewDrawer
        repositoryId={repositoryId}
        filePath={previewFilePath}
        onClose={() => setPreviewFilePath(null)}
      />
    </div>
  );
}

function NoRepositoryState() {
  return (
    <EmptyRepositoryState
      pageTitle="Command Center"
      pageDescription="Select an active repository from your workspace or import a new one from GitHub to activate health scoring, engineering hotspots, and AI Copilot."
      destinationPrefix="/command-center"
    />
  );
}

function RepositoryNotFoundState() {
  return (
    <div className="max-w-[560px] mx-auto mt-16 flex flex-col items-center text-center gap-3">
      <SearchX size={22} className="text-slate-400" aria-hidden="true" />
      <p className="text-[13.5px] text-slate-600 leading-relaxed m-0">
        Repository not found. It may not exist, or it isn't associated with your account.
      </p>
      <a
        href="/import-repository"
        className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700"
      >
        Choose a repository
      </a>
    </div>
  );
}

function DashboardErrorState({ message, onRetry }) {
  return (
    <div className="max-w-[560px] mx-auto mt-16 flex flex-col items-center text-center gap-3">
      <AlertTriangle size={22} className="text-rose-500" aria-hidden="true" />
      <p className="text-[13.5px] text-rose-600 leading-relaxed m-0">
        {message || 'Failed to load repository dashboard data. Please try again.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12.5px] font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div className="max-w-[1240px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[84px] rounded-xl bg-slate-100 border border-slate-200" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-slate-100 border border-slate-200 mb-6" />
      <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
    </div>
  );
}
