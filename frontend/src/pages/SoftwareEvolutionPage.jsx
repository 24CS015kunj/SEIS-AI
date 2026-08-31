import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Flame, SearchX, Sparkles, TrendingUp } from 'lucide-react';
import {
  getRepositoryBranches,
  getRepositoryCommits,
  getRepositoryFiles,
  getRepositoryAnalysis,
} from '../services/repositoryService';
import { useRepositoryIdentity } from '../hooks/useRepositoryIdentity';
import { useRepositoryHeader } from '../hooks/useRepositoryHeader';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';
import FileCodePreviewDrawer from '../components/common/FileCodePreviewDrawer';
import EngineeringBackground from '../components/common/EngineeringBackground';

const SUGGESTED_QUESTIONS = [
  'What does this repository do?',
  'Which files make up the core logic?',
  'Summarize the architecture in plain English.',
  'Where should I start reading this codebase?',
];

const MAX_VISIBLE_HOTSPOTS = 8;
const MAX_VISIBLE_COMMIT_FILES = 6;

/**
 * Maps one real `Commit` document (`backend/src/models/commits.model.js`)
 * into the minimal shape this page needs. Deliberately not imported from
 * `SourceControlPage.jsx`'s own `mapCommit` -- that version also carries
 * branch-name/display fields (short hash formatting, additions/deletions)
 * this page doesn't use, and is a page-local (unexported) function there,
 * same reasoning Task 76 already used to keep its own commit mapping
 * page-local rather than sharing it.
 */
function mapCommit(raw) {
  return {
    sha: raw.githubSha,
    message: raw.message || 'No commit message',
    author: raw.author?.name || raw.author?.username || 'Unknown',
    committedAt: raw.committedAt,
    filesChanged: raw.filesChanged || [],
  };
}

/**
 * Groups real commit timestamps into day/week/month buckets, choosing
 * the smallest granularity that keeps the visible range readable -- the
 * choice is always derived from the real timespan of whatever commits
 * were actually fetched, never fixed (Task 79 §6). `null` granularity
 * means there is no usable timestamp data at all, distinct from "zero
 * commits in every bucket".
 */
function bucketCommitsByTime(commits) {
  const timestamps = commits
    .map((c) => new Date(c.committedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (timestamps.length === 0) return { granularity: null, buckets: [] };

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const spanDays = (maxTime - minTime) / 86_400_000;
  const granularity = spanDays <= 14 ? 'day' : spanDays <= 120 ? 'week' : 'month';

  const keyOf = (t) => {
    const d = new Date(t);
    if (granularity === 'day') return d.toISOString().slice(0, 10);
    if (granularity === 'week') {
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - dow);
      return monday.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 7);
  };

  const counts = new Map();
  for (const t of timestamps) {
    const key = keyOf(t);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const buckets = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));

  return { granularity, buckets };
}

function formatBucketLabel(key, granularity) {
  if (granularity === 'month') {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const GRANULARITY_LABEL = { day: 'day', week: 'week', month: 'month' };

/**
 * Task 79: the first real Software Evolution page. Every number here
 * traces to one of three already-existing real endpoints -- no new
 * backend route, no new analysis engine. `EvolutionAnalysisService`
 * (FastAPI) was confirmed during Task 74's reconnaissance to have no
 * reachable API route, so this page is deliberately built from what
 * *is* reachable today: `GET .../branches` + `.../commits` (real commit
 * timestamps/messages/changed-files), `.../files` (real file existence,
 * for gating navigation exactly like Task 76), and `.../analysis` (the
 * same real `hotspots`/`trends` Task 74 already surfaces on the
 * Dashboard, read-only here -- this page never triggers generation
 * itself, matching every other page's "GET only, POST is an explicit
 * user action elsewhere" convention).
 */
export default function SoftwareEvolutionPage() {
  const { repositoryId } = useParams();
  return <SoftwareEvolutionPageContent key={repositoryId ?? 'none'} repositoryId={repositoryId} />;
}

function SoftwareEvolutionPageContent({ repositoryId }) {
  const identity = useRepositoryIdentity(repositoryId);
  const identityReady = identity.status === 'ready';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [previewFilePath, setPreviewFilePath] = useState(null);

  const [branches, setBranches] = useState([]);
  const [branchSyncStatus, setBranchSyncStatus] = useState('idle'); // idle | loading | ready | error
  const [branchSyncError, setBranchSyncError] = useState(null);
  const [branchRetryNonce, setBranchRetryNonce] = useState(0);

  const headerRepo = useRepositoryHeader(identity, { syncStatus: branchSyncStatus });

  const [commitsStatus, setCommitsStatus] = useState('idle'); // idle | loading | ready | error
  const [commits, setCommits] = useState([]);
  const [commitsError, setCommitsError] = useState(null);
  const [commitsRetryNonce, setCommitsRetryNonce] = useState(0);

  // No dedicated error UI reads `filesStatus === 'error'` -- a failed
  // file fetch simply leaves `validFilePaths` at `null` (see below),
  // which every navigation link already treats as "not yet resolvable"
  // and renders as plain, non-clickable text -- the same honest,
  // non-broken degradation Task 76 already established for a slow/failed
  // file list, so no separate retry control is needed here.
  const [filesStatus, setFilesStatus] = useState('idle'); // idle | loading | ready | error
  const [files, setFiles] = useState([]);

  const [analysisStatus, setAnalysisStatus] = useState('idle'); // idle | loading | none | ready | error
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisStale, setAnalysisStale] = useState(false);

  useEffect(() => {
    if (!identityReady) {
      setBranchSyncStatus('idle');
      setBranchSyncError(null);
      return;
    }
    let cancelled = false;
    setBranchSyncStatus('loading');
    setBranchSyncError(null);
    getRepositoryBranches(repositoryId)
      .then((realBranches) => {
        if (cancelled) return;
        setBranches(realBranches);
        setBranchSyncStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setBranchSyncStatus('error');
        setBranchSyncError(err.response?.data?.message || 'Failed to synchronize branch information. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady, branchRetryNonce]);

  // Real commit activity, merged across every real branch (deduplicated
  // by SHA) -- the same "all branches" merge Source Control's own 'all'
  // filter already performs, run once per repository load rather than
  // re-derived per branch-filter change (this page has no branch filter
  // UI). Each branch call uses the existing endpoint's own default page
  // size (30, Express's own default) -- not fetched further, so the
  // resulting timespan is honestly labeled as "most recently synced"
  // rather than implied to be the repository's complete history.
  useEffect(() => {
    if (!repositoryId || branchSyncStatus !== 'ready' || branches.length === 0) return;
    let cancelled = false;
    setCommitsStatus('loading');
    setCommitsError(null);
    Promise.all(branches.map((b) => getRepositoryCommits(repositoryId, b._id)))
      .then((results) => {
        if (cancelled) return;
        const merged = new Map();
        for (const res of results) {
          for (const raw of res.commits) {
            if (!merged.has(raw.githubSha)) merged.set(raw.githubSha, mapCommit(raw));
          }
        }
        const sorted = [...merged.values()].sort(
          (a, b) => new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime()
        );
        setCommits(sorted);
        setCommitsStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setCommitsStatus('error');
        setCommitsError(err.response?.data?.message || 'Failed to load commit history.');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchSyncStatus, branches, commitsRetryNonce]);

  const defaultBranch = useMemo(
    () => (branches.length > 0 ? branches.find((b) => b.isDefault) ?? branches[0] : null),
    [branches]
  );

  // Real, currently-synced file paths for the repository's default
  // branch -- the same branch Architecture itself always resolves
  // `?file=` against (it has no per-branch view). Used only to gate
  // whether a hotspot/changed-file is a genuine, resolvable navigation
  // target, exactly the pattern Task 76 already established for Source
  // Control's changed-file links. `null` while not yet loaded, distinct
  // from a resolved Set that simply doesn't contain a given path.
  useEffect(() => {
    if (!repositoryId || branchSyncStatus !== 'ready' || !defaultBranch) return;
    let cancelled = false;
    setFilesStatus('loading');
    getRepositoryFiles(repositoryId, defaultBranch._id)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files || []);
        setFilesStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setFilesStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchSyncStatus, defaultBranch]);

  // Read-only: this page never triggers generation itself (matching
  // Command Center/Architecture's own "GET only" convention) -- a
  // repository with no analysis yet is pointed at Command Center's
  // existing "Generate Insights" control instead of a second, duplicate
  // generate-button implementation here (Task 79 §"do not duplicate the
  // underlying calculation").
  useEffect(() => {
    if (!identityReady) {
      setAnalysisStatus('idle');
      setAnalysisData(null);
      return;
    }
    let cancelled = false;
    setAnalysisStatus('loading');
    getRepositoryAnalysis(repositoryId)
      .then((data) => {
        if (cancelled) return;
        setAnalysisData(data.analysis);
        setAnalysisStale(Boolean(data.stale));
        setAnalysisStatus(data.analysis ? 'ready' : 'none');
      })
      .catch(() => {
        if (cancelled) return;
        setAnalysisStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady]);

  const validFilePaths = useMemo(() => {
    if (filesStatus !== 'ready') return null;
    return new Set(files.filter((f) => f.type === 'file').map((f) => f.path));
  }, [filesStatus, files]);

  const activity = useMemo(() => bucketCommitsByTime(commits), [commits]);
  const commitsWithFiles = useMemo(() => commits.filter((c) => c.filesChanged.length > 0), [commits]);
  const distinctChangedFiles = useMemo(
    () => new Set(commits.flatMap((c) => c.filesChanged)),
    [commits]
  );

  const showSkeleton = identity.status === 'loading' || branchSyncStatus === 'loading' || branchSyncStatus === 'idle';

  return (
    <div className="relative min-h-screen w-full bg-[#F5F6FA] flex">
      <EngineeringBackground />
      <CommandCenterSidebar
        repository={headerRepo}
        repositoryId={identityReady ? repositoryId : null}
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

        <main className="flex-1 px-4 sm:px-6 py-6">
          <p className="sr-only" role="status" aria-live="polite">
            {showSkeleton ? 'Loading software evolution data.' : 'Software evolution data loaded.'}
          </p>

          {!repositoryId ? (
            <NoRepositoryState />
          ) : identity.status === 'not-found' ? (
            <RepositoryNotFoundState />
          ) : identity.status === 'error' ? (
            <EvolutionErrorState message={identity.error} onRetry={() => window.location.reload()} />
          ) : showSkeleton ? (
            <EvolutionSkeleton />
          ) : branchSyncStatus === 'error' ? (
            <EvolutionErrorState message={branchSyncError} onRetry={() => setBranchRetryNonce((n) => n + 1)} />
          ) : (
            <div className="max-w-[1240px] mx-auto flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={17} className="text-blue-600" aria-hidden="true" />
                  <h1 className="text-[16px] font-bold text-slate-900 m-0">Software Evolution</h1>
                </div>
                <p className="text-[12.5px] text-slate-500 m-0">
                  {headerRepo.owner}/{headerRepo.name} · {headerRepo.branch} — real commit activity and analysis
                  findings for this repository.
                  {analysisStatus === 'ready' && analysisData?.generatedAt && (
                    <span> · Analysis generated {new Date(analysisData.generatedAt).toLocaleDateString()}</span>
                  )}
                  {analysisStatus === 'ready' && analysisStale && (
                    <span className="text-amber-600"> · New commits since this analysis</span>
                  )}
                </p>
              </div>

              <OverviewCards
                commitsStatus={commitsStatus}
                commitCount={commits.length}
                changedFileCount={distinctChangedFiles.size}
                hasAnyChangedFileData={commitsWithFiles.length > 0}
                analysisStatus={analysisStatus}
                hotspotCount={analysisData?.hotspots?.length ?? 0}
                highChurnCount={analysisData?.trends?.high_churn_modules?.length ?? 0}
              />

              <CommitActivitySection
                status={commitsStatus}
                error={commitsError}
                activity={activity}
                onRetry={() => setCommitsRetryNonce((n) => n + 1)}
              />

              <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
                <ModuleEvolutionSection analysisStatus={analysisStatus} trends={analysisData?.trends ?? null} />
                <div className="mt-6 lg:mt-0">
                  <HotspotEvolutionSection
                    analysisStatus={analysisStatus}
                    hotspots={analysisData?.hotspots ?? []}
                    insights={analysisData?.insights ?? []}
                    repositoryId={repositoryId}
                    validFilePaths={validFilePaths}
                    onPreviewFile={(path) => setPreviewFilePath(path)}
                  />
                </div>
              </div>

              <RecentCommitsSection
                status={commitsStatus}
                error={commitsError}
                commits={commitsWithFiles.slice(0, MAX_VISIBLE_COMMIT_FILES)}
                totalWithFiles={commitsWithFiles.length}
                repositoryId={repositoryId}
                validFilePaths={validFilePaths}
                onRetry={() => setCommitsRetryNonce((n) => n + 1)}
                onPreviewFile={(path) => setPreviewFilePath(path)}
              />

              {analysisStatus === 'none' && (
                <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-3">
                  <Sparkles size={15} className="text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-[12.5px] text-blue-900 leading-relaxed m-0">
                    Repository analysis has not been generated yet. Hotspots and module trends will appear here once
                    you{' '}
                    <Link to={`/command-center/${repositoryId}#insights`} className="font-semibold underline">
                      generate AI Insights
                    </Link>{' '}
                    from the Dashboard.
                  </p>
                </div>
              )}
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

function OverviewCards({
  commitsStatus,
  commitCount,
  changedFileCount,
  hasAnyChangedFileData,
  analysisStatus,
  hotspotCount,
  highChurnCount,
}) {
  const cards = [
    {
      key: 'commits',
      label: 'Recent Commits',
      value: commitsStatus === 'ready' ? commitCount : null,
      hint: commitsStatus === 'ready' ? 'Most recently synced, across all branches' : 'Loading…',
    },
    {
      key: 'files',
      label: 'Files Changed',
      value: commitsStatus === 'ready' && hasAnyChangedFileData ? changedFileCount : null,
      hint:
        commitsStatus !== 'ready'
          ? 'Loading…'
          : hasAnyChangedFileData
            ? 'Distinct files touched by recent commits'
            : 'Requires generating AI Insights at least once',
    },
    {
      key: 'hotspots',
      label: 'Hotspots',
      value: analysisStatus === 'ready' ? hotspotCount : null,
      hint: analysisStatus === 'ready' ? 'Files ranked by real churn' : 'Not available yet',
    },
    {
      key: 'highChurn',
      label: 'High-Churn Modules',
      value: analysisStatus === 'ready' ? highChurnCount : null,
      hint: analysisStatus === 'ready' ? '>50% of analyzed churn' : 'Not available yet',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
            {c.label}
          </span>
          <div
            className={`font-mono tabular-nums ${
              c.value == null ? 'text-[14px] font-semibold text-slate-400' : 'text-[22px] font-bold text-slate-900'
            }`}
          >
            {c.value == null ? 'Not available' : c.value}
          </div>
          {c.hint && <p className="text-[11px] text-slate-400 mt-1 m-0 leading-snug">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function CommitActivitySection({ status, error, activity, onRetry }) {
  return (
    <section aria-labelledby="commit-activity-heading">
      <h2 id="commit-activity-heading" className="text-[13.5px] font-bold text-slate-900 mb-3">
        Commit Activity
      </h2>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        {status === 'loading' || status === 'idle' ? (
          <div className="h-32 flex items-center justify-center">
            <p className="text-[13px] text-slate-400 m-0">Loading commit activity…</p>
          </div>
        ) : status === 'error' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-rose-600 m-0">{error || 'Failed to load commit history.'}</p>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : activity.granularity === null ? (
          <div className="py-6 text-center">
            <p className="text-[13px] text-slate-400 m-0">Historical evolution data is not available for this repository.</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-3 m-0">
              Real commits, grouped by {GRANULARITY_LABEL[activity.granularity]} — based on the most recently synced
              commits available, not necessarily this repository's complete history.
            </p>
            <div
              className="flex items-end gap-1.5 h-28 overflow-x-auto pb-1"
              role="img"
              aria-label={activity.buckets
                .map((b) => `${formatBucketLabel(b.key, activity.granularity)}: ${b.count} commits`)
                .join(', ')}
            >
              {activity.buckets.map((b) => {
                const max = Math.max(...activity.buckets.map((x) => x.count), 1);
                const heightPercent = Math.max((b.count / max) * 100, 6);
                return (
                  <div key={b.key} className="flex flex-col items-center gap-1 shrink-0 w-8" aria-hidden="true">
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full rounded-t bg-blue-500"
                        style={{ height: `${heightPercent}%` }}
                        title={`${b.count} commit${b.count === 1 ? '' : 's'}`}
                      />
                    </div>
                    <span className="text-[9.5px] text-slate-400 font-mono whitespace-nowrap">
                      {formatBucketLabel(b.key, activity.granularity)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ModuleEvolutionSection({ analysisStatus, trends }) {
  const moduleTrends = trends?.module_trends ?? [];
  return (
    <section aria-labelledby="module-evolution-heading">
      <h2 id="module-evolution-heading" className="text-[13.5px] font-bold text-slate-900 mb-3">
        Module Evolution
      </h2>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        {analysisStatus !== 'ready' ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">
            {analysisStatus === 'error' ? 'Unable to load repository analysis.' : 'Module trends are not available for this analysis.'}
          </p>
        ) : moduleTrends.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">Module trends are not available for this analysis.</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-3 m-0">
              Current structural trend based on the latest repository analysis snapshot.
            </p>
            <ul className="flex flex-col gap-3">
            {moduleTrends.map((m) => {
              const percent = Math.round(m.churn_share * 100);
              return (
                <li key={m.module} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex items-center gap-1.5">
                      <span className="text-[12.5px] font-mono text-slate-800 truncate" title={m.module}>
                        {m.module}
                      </span>
                      {m.is_high_churn && (
                        <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                          High Churn
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-mono font-semibold text-slate-500 tabular-nums">
                      {percent}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(percent, 3)}%` }} />
                  </div>
                  <span className="text-[10.5px] text-slate-400">
                    {m.commit_count} commit{m.commit_count === 1 ? '' : 's'} · {m.file_count} file
                    {m.file_count === 1 ? '' : 's'}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
        )}
      </div>
    </section>
  );
}

function HotspotEvolutionSection({ analysisStatus, hotspots, insights, repositoryId, validFilePaths, onPreviewFile }) {
  const flaggedPaths = new Set((insights ?? []).map((i) => i.subject));
  const sorted = [...hotspots].sort((a, b) => b.hotspot_score - a.hotspot_score).slice(0, MAX_VISIBLE_HOTSPOTS);

  return (
    <section aria-labelledby="hotspot-evolution-heading">
      <h2 id="hotspot-evolution-heading" className="flex items-center gap-1.5 text-[13.5px] font-bold text-slate-900 mb-3">
        <Flame size={14} className="text-blue-600" aria-hidden="true" />
        Hotspot Evolution
      </h2>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        {analysisStatus !== 'ready' ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">
            {analysisStatus === 'error' ? 'Unable to load repository analysis.' : 'No hotspot data is available for this analysis.'}
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">No hotspot data is available for this analysis.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {sorted.map((h) => {
              const score = Math.round(h.hotspot_score);
              const resolvable = validFilePaths ? validFilePaths.has(h.file_path) : null;
              const flagged = flaggedPaths.has(h.file_path);
              const rowClassName =
                'flex items-center gap-3 rounded-lg px-2.5 py-2 -mx-2.5 transition-colors';

              const inner = (
                <>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    {onPreviewFile && resolvable === true ? (
                      <button
                        type="button"
                        onClick={() => onPreviewFile(h.file_path)}
                        className="min-w-0 text-[12px] font-mono text-blue-700 hover:text-blue-900 hover:underline truncate text-left bg-transparent border-0 p-0 cursor-pointer"
                        title={`Preview ${h.file_path}`}
                      >
                        {h.file_path}
                      </button>
                    ) : (
                      <span className="min-w-0 text-[12px] font-mono text-slate-700 truncate" title={h.file_path}>
                        {h.file_path}
                      </span>
                    )}
                    {flagged && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                        Flagged
                      </span>
                    )}
                  </span>
                  <div className="hidden sm:block w-16 shrink-0 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(score, 4)}%` }} />
                  </div>
                  <span className="shrink-0 w-7 text-right text-[11px] font-mono font-semibold text-slate-500 tabular-nums">
                    {score}
                  </span>
                  <span className="hidden sm:inline shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                    {h.commit_count} commit{h.commit_count === 1 ? '' : 's'}
                  </span>
                </>
              );

              if (repositoryId && resolvable === true) {
                return (
                  <li key={h.file_path} className={`${rowClassName} hover:bg-blue-50/60`}>
                    {inner}
                    <Link
                      to={`/architecture/${repositoryId}?file=${encodeURIComponent(h.file_path)}`}
                      aria-label={`Open ${h.file_path} in Architecture`}
                      className="text-blue-600 hover:text-blue-800 shrink-0"
                      title="Open in Architecture"
                    >
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </Link>
                  </li>
                );
              }

              return (
                <li key={h.file_path} className={rowClassName}>
                  {inner}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function RecentCommitsSection({ status, error, commits, totalWithFiles, repositoryId, validFilePaths, onRetry, onPreviewFile }) {
  return (
    <section aria-labelledby="commit-files-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="commit-files-heading" className="text-[13.5px] font-bold text-slate-900 m-0">
          Recent Commits &amp; Changed Files
        </h2>
        {repositoryId && (
          <Link
            to={`/source-control/${repositoryId}`}
            className="text-[11.5px] font-semibold text-blue-600 hover:text-blue-700"
          >
            View all in Source Control
          </Link>
        )}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        {status === 'loading' || status === 'idle' ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">Loading commits…</p>
        ) : status === 'error' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-rose-600 m-0">{error || 'Failed to load commit history.'}</p>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : commits.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 m-0 text-center py-4">
            Changed-file history is not available for this repository.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {commits.map((c) => (
              <li key={c.sha} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                <p className="text-[12.5px] text-slate-800 leading-snug m-0 truncate">{c.message}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5 mb-2">
                  {c.author} · {new Date(c.committedAt).toLocaleDateString()}
                </p>
                <div className="flex flex-wrap gap-1">
                  {c.filesChanged.map((path) => {
                    const resolvable = validFilePaths ? validFilePaths.has(path) : null;
                    if (repositoryId && resolvable === true) {
                      return (
                        <div
                          key={path}
                          className="inline-flex items-center gap-1 max-w-full text-[10.5px] font-mono text-blue-700 bg-blue-50 border border-blue-100 rounded-full pl-2 pr-1.5 py-0.5"
                        >
                          {onPreviewFile ? (
                            <button
                              type="button"
                              onClick={() => onPreviewFile(path)}
                              className="truncate text-left text-blue-700 hover:text-blue-900 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                              title={`Preview ${path}`}
                            >
                              {path}
                            </button>
                          ) : (
                            <span className="truncate">{path}</span>
                          )}
                          <Link
                            to={`/architecture/${repositoryId}?file=${encodeURIComponent(path)}`}
                            aria-label={`Open ${path} in Architecture`}
                            className="text-blue-600 hover:text-blue-800 shrink-0"
                            title="Open in Architecture"
                          >
                            <ArrowUpRight size={9} aria-hidden="true" />
                          </Link>
                        </div>
                      );
                    }
                    return (
                      <span
                        key={path}
                        className="inline-flex items-center max-w-full text-[10.5px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5"
                      >
                        <span className="truncate">{path}</span>
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
        {status === 'ready' && totalWithFiles > commits.length && (
          <p className="text-[11px] text-slate-400 mt-3 mb-0">
            +{totalWithFiles - commits.length} more commit{totalWithFiles - commits.length === 1 ? '' : 's'} with
            changed-file data — see Source Control for the full list.
          </p>
        )}
      </div>
    </section>
  );
}

function NoRepositoryState() {
  return (
    <div className="max-w-[560px] mx-auto mt-16 text-center">
      <p className="text-[13.5px] text-slate-500 leading-relaxed">
        Open this page from a real, synced repository (via Source Control or the Dashboard) to see its evolution.
      </p>
    </div>
  );
}

function RepositoryNotFoundState() {
  return (
    <div className="max-w-[560px] mx-auto mt-16 flex flex-col items-center text-center gap-3">
      <SearchX size={22} className="text-slate-400" aria-hidden="true" />
      <p className="text-[13.5px] text-slate-600 leading-relaxed m-0">
        Repository not found. It may not exist, or it isn't associated with your account.
      </p>
      <a href="/import-repository" className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700">
        Choose a repository
      </a>
    </div>
  );
}

function EvolutionErrorState({ message, onRetry }) {
  return (
    <div className="max-w-[560px] mx-auto mt-16 flex flex-col items-center text-center gap-3">
      <AlertTriangle size={22} className="text-rose-500" aria-hidden="true" />
      <p className="text-[13.5px] text-rose-600 leading-relaxed m-0">
        {message || 'Failed to load software evolution data. Please try again.'}
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

function EvolutionSkeleton() {
  return (
    <div className="max-w-[1240px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[84px] rounded-xl bg-slate-100 border border-slate-200" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-slate-100 border border-slate-200 mb-6" />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
        <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
      </div>
    </div>
  );
}
