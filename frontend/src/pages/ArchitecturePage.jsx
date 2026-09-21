import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Boxes, Loader2, SearchX, Sparkles } from 'lucide-react';
import {
  getRepositoryDashboard,
  getRepositoryFiles,
  getRepositoryAnalysis,
  getArchitectureSummary,
  getRepositoryDependencies,
} from '../services/repositoryService';
import { useRepositoryIdentity } from '../hooks/useRepositoryIdentity';
import { useRepositoryHeader } from '../hooks/useRepositoryHeader';
import { buildRepositoryTree, findNodeByPath } from '../utils/buildRepositoryTree';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';
import CopilotMarkdown from '../components/commandCenter/CopilotMarkdown';
import ArchitectureOverviewCards from '../components/architecture/ArchitectureOverviewCards';
import RepositoryTree from '../components/architecture/RepositoryTree';
import ModuleDetailsPanel from '../components/architecture/ModuleDetailsPanel';
import DependencyAnalysisPanel from '../components/architecture/DependencyAnalysisPanel';
import FileCodePreviewDrawer from '../components/common/FileCodePreviewDrawer';
import CitationDrawer from '../components/chat/CitationDrawer';
import EngineeringBackground from '../components/common/EngineeringBackground';

const SUGGESTED_QUESTIONS = [
  'What does this repository do?',
  'Which files make up the core logic?',
  'Summarize the architecture in plain English.',
  'Where should I start reading this codebase?',
];

/**
 * Task 69: a real, dedicated Architecture page -- previously the sidebar's
 * "Architecture" item was only an in-page anchor to a small section on
 * the Dashboard, which (when that section's own `available` flag was
 * false, or simply because it's a small widget in a busy page) read as
 * "an effectively empty page" in live testing. This page is a genuine
 * destination: real repository structure (from the same synced `File`
 * data Source Control's Files tab and the Dashboard already use), real
 * overview counts, and an honest "not available" state for dependency
 * relationships -- this codebase has no dependency-graph engine, and
 * this page never pretends otherwise.
 *
 * Reuses two already-existing, already-tested endpoints
 * (`GET .../dashboard`, Task 68; `GET .../branches/:branchId/files`,
 * Task 58) rather than adding a new one -- the existing contract already
 * carries everything this page needs (Task 69 §4 "prefer reuse").
 */
export default function ArchitecturePage() {
  // Task 71: see CommandCenterPage's identical pattern -- `repositoryId`
  // comes from the URL (survives refresh/direct link), and `key` forces a
  // full, clean remount (selected module, retry counters, Copilot
  // conversation) whenever the active repository actually changes.
  const { repositoryId } = useParams();
  return <ArchitecturePageContent key={repositoryId ?? 'none'} repositoryId={repositoryId} />;
}

function ArchitecturePageContent({ repositoryId }) {
  const identity = useRepositoryIdentity(repositoryId);
  const identityReady = identity.status === 'ready';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [previewFilePath, setPreviewFilePath] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [citationDrawerOpen, setCitationDrawerOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);

  // Task 75: an optional `?file=<repo-relative path>` deep link -- set by
  // a Copilot citation click, but equally valid as a plain pasted/shared
  // URL. `targetFilePath` is read once per navigation; resolving it
  // against the real tree (once files have actually loaded) happens in
  // the effect below, never eagerly against data that isn't ready yet.
  const [searchParams] = useSearchParams();
  const targetFilePath = searchParams.get('file');
  const [unresolvedFilePath, setUnresolvedFilePath] = useState(null);

  const [dashboardStatus, setDashboardStatus] = useState('idle'); // idle | loading | ready | error
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState(null);

  const [filesStatus, setFilesStatus] = useState('idle'); // idle | loading | ready | error
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState(null);

  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [analysisData, setAnalysisData] = useState(null);

  // Task 93: Architecture Summary (AI-generated)
  const [archSummaryStatus, setArchSummaryStatus] = useState('idle'); // idle | loading | ready | error
  const [archSummaryData, setArchSummaryData] = useState(null);  // { answer, citations }
  const [archSummaryError, setArchSummaryError] = useState(null);

  // Retry button support (Task 70 audit finding: this fetch previously
  // had no recovery action besides a full page reload) -- same pattern
  // as CommandCenterPage's own `dashboardRetryNonce`.
  const [dashboardRetryNonce, setDashboardRetryNonce] = useState(0);

  useEffect(() => {
    if (!identityReady) {
      setDashboardStatus('idle');
      setDashboardData(null);
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
        setDashboardError(err.response?.data?.message || 'Failed to load repository architecture data.');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady, dashboardRetryNonce]);

  const branchId = dashboardData?.branch?.id ?? null;
  const [filesRetryNonce, setFilesRetryNonce] = useState(0);

  useEffect(() => {
    if (!repositoryId || !branchId) {
      setFilesStatus('idle');
      setFiles([]);
      return;
    }
    let cancelled = false;
    setFilesStatus('loading');
    setFilesError(null);
    getRepositoryFiles(repositoryId, branchId)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files || []);
        setFilesStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setFilesStatus('error');
        setFilesError(err.response?.data?.message || 'Failed to load repository files.');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchId, filesRetryNonce]);

  const [dependencyStatus, setDependencyStatus] = useState('idle'); // idle | loading | ready | error
  const [dependencyData, setDependencyData] = useState(null);

  useEffect(() => {
    if (!repositoryId || !branchId) {
      setDependencyStatus('idle');
      setDependencyData(null);
      return;
    }
    let cancelled = false;
    setDependencyStatus('loading');
    getRepositoryDependencies(repositoryId, branchId)
      .then((res) => {
        if (cancelled) return;
        setDependencyData(res);
        setDependencyStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setDependencyStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchId]);

  const handleRefreshDependencies = () => {
    if (!repositoryId || !branchId) return;
    setDependencyStatus('loading');
    getRepositoryDependencies(repositoryId, branchId, { forceRefresh: true })
      .then((res) => {
        setDependencyData(res);
        setDependencyStatus('ready');
      })
      .catch(() => {
        setDependencyStatus('error');
      });
  };

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

  // Task 77: same shared derivation CommandCenterPage/SourceControlPage
  // now use -- identical output to this page's previous local `useMemo`.
  const headerRepo = useRepositoryHeader(identity, {
    syncStatus: dashboardStatus,
    branchNameOverride: dashboardData?.branch?.name,
    lastFetchedAtOverride: dashboardData?.repository?.lastFetchedAt,
  });

  const tree = useMemo(() => buildRepositoryTree(files), [files]);

  // Task 75: resolves `targetFilePath` against the real, already-fetched
  // tree -- runs only once files have actually finished loading for this
  // branch, so a still-loading file list is never misread as "this file
  // doesn't exist" (§8). A resolved path selects the real node exactly
  // like a manual tree click would; an unresolved one never falls back to
  // selecting anything else -- it only records which path couldn't be
  // found, rendered as an honest inline notice below, and leaves
  // `selectedNode` untouched. Re-runs correctly when a second citation
  // updates `targetFilePath` without a page remount (same repositoryId).
  useEffect(() => {
    if (!targetFilePath) {
      setUnresolvedFilePath(null);
      return;
    }
    if (filesStatus !== 'ready') return;
    const node = findNodeByPath(tree, targetFilePath);
    if (node) {
      setSelectedNode(node);
      setUnresolvedFilePath(null);
    } else {
      setUnresolvedFilePath(targetFilePath);
    }
  }, [targetFilePath, tree, filesStatus]);

  const moduleCount = dashboardData?.architecture?.directories?.length ?? 0;
  const fileCount = dashboardData?.files?.fileCount ?? 0;
  const languages = dashboardData?.languages?.breakdown ?? [];
  const dependenciesAvailable = dashboardData?.dependencies?.available ?? false;

  const showSkeleton = identity.status === 'loading' || dashboardStatus === 'loading' || dashboardStatus === 'idle';

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
            {showSkeleton ? 'Loading repository architecture.' : 'Repository architecture loaded.'}
          </p>

          {!repositoryId ? (
            <NoRepositoryState />
          ) : identity.status === 'not-found' ? (
            <RepositoryNotFoundState />
          ) : identity.status === 'error' ? (
            <ArchitectureErrorState message={identity.error} onRetry={() => window.location.reload()} />
          ) : showSkeleton ? (
            <ArchitectureSkeleton />
          ) : dashboardStatus === 'error' ? (
            <ArchitectureErrorState message={dashboardError} onRetry={() => setDashboardRetryNonce((n) => n + 1)} />
          ) : (
            <div className="max-w-[1240px] mx-auto flex flex-col gap-6">
              <div>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <Boxes size={17} className="text-blue-600" aria-hidden="true" />
                    <h1 className="text-[16px] font-bold text-slate-900 m-0">Architecture</h1>
                  </div>
                  {/* Task 93: Summarize Architecture button */}
                  {filesStatus === 'ready' && files.length > 0 && (
                    <button
                      type="button"
                      id="summarize-architecture-btn"
                      onClick={async () => {
                        if (archSummaryStatus === 'loading') return;
                        setArchSummaryStatus('loading');
                        setArchSummaryData(null);
                        setArchSummaryError(null);
                        try {
                          const data = await getArchitectureSummary(repositoryId);
                          setArchSummaryData({ answer: data.answer, citations: data.citations ?? [] });
                          setArchSummaryStatus('ready');
                        } catch (err) {
                          setArchSummaryError(err.response?.data?.message || 'Unable to generate summary. Make sure this repository has been ingested.');
                          setArchSummaryStatus('error');
                        }
                      }}
                      disabled={archSummaryStatus === 'loading'}
                      aria-label="Summarize this repository architecture with AI"
                      aria-busy={archSummaryStatus === 'loading'}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[12px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                    >
                      {archSummaryStatus === 'loading'
                        ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        : <Sparkles size={13} aria-hidden="true" />}
                      <span>{archSummaryStatus === 'loading' ? 'Summarizing…' : 'Summarize Architecture'}</span>
                    </button>
                  )}
                </div>
                <p className="text-[12.5px] text-slate-500 m-0">
                  {headerRepo.owner}/{headerRepo.name} · {headerRepo.branch} — repository structure derived from the
                  latest synced source.
                </p>
              </div>

              {/* Task 93: Architecture Summary Card */}
              {(archSummaryStatus === 'loading' || archSummaryStatus === 'ready' || archSummaryStatus === 'error') && (
                <div
                  role="region"
                  aria-live="polite"
                  aria-label="AI architecture summary"
                  className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-blue-600 shrink-0" aria-hidden="true" />
                    <span className="text-[13px] font-bold text-blue-800">AI Architecture Summary</span>
                    {archSummaryStatus === 'loading' && (
                      <Loader2 size={13} className="animate-spin text-blue-500 ml-1" aria-hidden="true" />
                    )}
                  </div>
                  {archSummaryStatus === 'loading' ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-3 bg-blue-100 rounded w-3/4" />
                      <div className="h-3 bg-blue-100 rounded w-full" />
                      <div className="h-3 bg-blue-100 rounded w-5/6" />
                      <div className="h-3 bg-blue-100 rounded w-2/3" />
                      <div className="h-3 bg-blue-100 rounded w-full" />
                    </div>
                  ) : archSummaryStatus === 'error' ? (
                    <div className="flex items-start gap-2">
                      <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="text-[12.5px] text-rose-600 m-0 leading-relaxed">{archSummaryError}</p>
                    </div>
                  ) : archSummaryData ? (
                    <>
                      <div className="text-[12.5px] text-slate-800 leading-relaxed prose-sm max-w-none">
                        <CopilotMarkdown content={archSummaryData.answer} />
                      </div>
                      {archSummaryData.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {archSummaryData.citations.map((c, i) => (
                            <Link
                              key={c.chunk_id ?? i}
                              to={`/architecture/${repositoryId}?file=${encodeURIComponent(c.file_path)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 text-[11px] font-mono font-semibold no-underline transition-colors"
                              title={`${c.file_path} lines ${c.start_line}–${c.end_line}`}
                            >
                              [{i + 1}] {c.file_path.split('/').pop()}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {unresolvedFilePath && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3">
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-[12.5px] text-amber-900 leading-relaxed m-0">
                    <span className="font-mono">{unresolvedFilePath}</span> couldn't be found in this repository's
                    currently synced structure. It may be on a different branch, or no longer exist.
                  </p>
                </div>
              )}

              <ArchitectureOverviewCards
                moduleCount={moduleCount}
                fileCount={fileCount}
                languages={languages}
                dependenciesAvailable={dependenciesAvailable}
              />

              <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start">
                <section aria-labelledby="repo-structure-heading">
                  <h2 id="repo-structure-heading" className="text-[13.5px] font-bold text-slate-900 mb-3">
                    Repository Structure
                  </h2>
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
                    {!dashboardData?.branch ? (
                      <p className="text-[13px] text-slate-500 m-0 p-3">
                        This repository has not been synced yet. Visit Source Control to sync branches first.
                      </p>
                    ) : filesStatus === 'loading' || filesStatus === 'idle' ? (
                      <p className="text-[13px] text-slate-500 m-0 p-3">Loading repository files…</p>
                    ) : filesStatus === 'error' ? (
                      <div className="p-3 flex items-center justify-between gap-3">
                        <p className="text-[13px] text-rose-600 m-0">{filesError}</p>
                        <button
                          type="button"
                          onClick={() => setFilesRetryNonce((n) => n + 1)}
                          className="shrink-0 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11.5px] font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    ) : files.length === 0 ? (
                      <p className="text-[13px] text-slate-500 m-0 p-3">
                        No files are synced for this branch yet. Visit Source Control's Files tab to sync them.
                      </p>
                    ) : (
                      <RepositoryTree root={tree} selectedPath={selectedNode?.path} onSelect={setSelectedNode} />
                    )}
                  </div>
                </section>

                <div className="mt-6 lg:mt-0">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Module Details
                  </span>
                  <ModuleDetailsPanel node={selectedNode} />
                </div>
              </div>

              <DependencyAnalysisPanel
                dependencyStatus={dependencyStatus}
                dependencyData={dependencyData}
                analysisStatus={analysisStatus}
                analysis={analysisData}
                repositoryHref={`/command-center/${repositoryId}`}
                onRefresh={handleRefreshDependencies}
                onSelectFile={(filePath) => {
                  setActiveCitation({
                    file_path: filePath,
                    start_line: 1,
                    end_line: 100,
                  });
                  setCitationDrawerOpen(true);
                }}
              />
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
      <CitationDrawer
        repositoryId={repositoryId}
        citation={activeCitation}
        isOpen={citationDrawerOpen}
        onClose={() => setCitationDrawerOpen(false)}
      />
    </div>
  );
}

function NoRepositoryState() {
  return (
    <div className="max-w-[560px] mx-auto mt-16 text-center">
      <p className="text-[13.5px] text-slate-500 leading-relaxed">
        Open this page from a real, synced repository (via Source Control or the Dashboard) to see its architecture.
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
      <a
        href="/import-repository"
        className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700"
      >
        Choose a repository
      </a>
    </div>
  );
}

function ArchitectureErrorState({ message, onRetry }) {
  return (
    <div className="max-w-[560px] mx-auto mt-16 flex flex-col items-center text-center gap-3">
      <AlertTriangle size={22} className="text-rose-500" aria-hidden="true" />
      <p className="text-[13.5px] text-rose-600 leading-relaxed m-0">
        {message || 'Failed to load repository architecture data. Please try again.'}
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

function ArchitectureSkeleton() {
  return (
    <div className="max-w-[1240px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[84px] rounded-xl bg-slate-100 border border-slate-200" />
        ))}
      </div>
      <div className="h-[420px] rounded-xl bg-slate-100 border border-slate-200" />
    </div>
  );
}
