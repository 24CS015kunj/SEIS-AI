import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Check, GitPullRequest, Loader2, SearchX, Sparkles } from 'lucide-react';
import { buildSourceControlData } from '../services/sourceControlMockData';
import {
  getRepositoryBranches,
  getRepositoryCommits,
  getRepositoryFiles,
  ingestRepository,
} from '../services/repositoryService';
import { useRepositoryIdentity } from '../hooks/useRepositoryIdentity';
import { API_BASE_URL } from '../services/apiClient';
import { useRepositoryHeader, formatRelativeTime } from '../hooks/useRepositoryHeader';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';
import SourceControlToolbar from '../components/sourceControl/SourceControlToolbar';
import CommitList from '../components/sourceControl/CommitList';
import CommitDetailDrawer from '../components/sourceControl/CommitDetailDrawer';
import BranchList from '../components/sourceControl/BranchList';
import FileList from '../components/sourceControl/FileList';
import FileCodePreviewDrawer from '../components/common/FileCodePreviewDrawer';
import EngineeringBackground from '../components/common/EngineeringBackground';
import CommitCategoryStrip from '../components/commandCenter/CommitCategoryStrip';
import { useAutoResolveDefaultRepository } from '../hooks/useAutoResolveDefaultRepository';

/**
 * Maps one real `Commit` document (backend/src/models/commits.model.js)
 * into the display shape CommitList/CommitRow/CommitDetailDrawer expect.
 * Per-file additions/deletions are never included -- the real
 * `filesChanged` field is a list of paths only (Task 57).
 */
function mapCommit(raw, branchName) {
  return {
    id: raw.githubSha,
    shortHash: raw.githubSha ? raw.githubSha.slice(0, 7) : '',
    message: raw.message || 'No commit message',
    author: { name: raw.author?.name || raw.author?.username || 'Unknown' },
    timestamp: formatRelativeTime(raw.committedAt) || 'Unknown time',
    committedAtRaw: raw.committedAt,
    branch: branchName,
    hasStats: raw.hasStats ?? (raw.additions !== null && raw.additions !== undefined && raw.deletions !== null && raw.deletions !== undefined),
    additions: raw.additions ?? null,
    deletions: raw.deletions ?? null,
    filesChanged: raw.changedFilesCount ?? (raw.filesChanged?.length ?? 0),
    files: (raw.filesChanged || []).map((p) => ({ path: p })),
  };
}

export default function SourceControlPage() {
  // Task 71: `repositoryId` is the URL's own `:repositoryId` param (the
  // single source of truth, replacing the old `location.state.repo`
  // pattern that didn't survive a refresh). `key` forces a full, clean
  // remount whenever the active repository actually changes -- every
  // branch/commit/file cache below is keyed by sub-identifiers (branch
  // name, branch `_id`) that could otherwise collide across two
  // different repositories' data.
  const { repositoryId } = useParams();
  useAutoResolveDefaultRepository(repositoryId, '/source-control');
  return <SourceControlPageContent key={repositoryId ?? 'none'} repositoryId={repositoryId} />;
}

function SourceControlPageContent({ repositoryId }) {
  const identity = useRepositoryIdentity(repositoryId);

  // Task 57/69/71: the mock module is used ONLY for
  // `copilotSuggestedQuestions` -- there is no existing backend endpoint
  // producing repository-specific suggested Copilot questions, so per the
  // "stop and report, don't invent" instruction this remains the mock's
  // static content (reported in the Task 70/71 audits as a genuine
  // missing-backend-capability, not silently hidden). This field's value
  // never actually varies with the argument passed in, so no repository
  // object is threaded through here anymore.
  const data = useMemo(() => buildSourceControlData(), []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('commits');
  const [branchFilter, setBranchFilter] = useState('all');
  const [openCommit, setOpenCommit] = useState(null);
  const [previewFilePath, setPreviewFilePath] = useState(null);

  // Real branches (Task 57) -- the same fetch Task 50 already relied on to
  // satisfy the ingestion prerequisite now also supplies the Branches tab
  // and the commit branch filter, instead of discarding the response.
  const [branches, setBranches] = useState([]);
  const [branchSyncStatus, setBranchSyncStatus] = useState('idle'); // idle | loading | ready | error
  const [branchSyncError, setBranchSyncError] = useState(null);

  // Real commits, cached per branch-filter key ('all' or a branch name) so
  // switching the filter back and forth doesn't re-fetch (instruction 15).
  const [commitsCache, setCommitsCache] = useState({});
  const requestedCommitKeys = useRef(new Set());

  // Real files (Task 58), cached per real branch `_id` -- unlike commits,
  // "all branches" has no honest single-call meaning for a file tree, so
  // it resolves to the repository's default branch (see resolvedFileBranch
  // below); every other branch selection maps to that exact branch's files.
  const [filesCache, setFilesCache] = useState({});
  const requestedFileKeys = useRef(new Set());

  const identityReady = identity.status === 'ready';

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
        setBranchSyncError(
          err.response?.data?.message || 'Failed to synchronize branch information. Please try again.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId, identityReady]);

  // Fetches commits for whichever branch-filter key is currently selected,
  // once per key (a ref, not state, drives the guard so this never
  // re-fires just because commitsCache itself changed).
  useEffect(() => {
    if (!repositoryId || branchSyncStatus !== 'ready' || branches.length === 0) return;
    const key = branchFilter;
    if (requestedCommitKeys.current.has(key)) return;
    requestedCommitKeys.current.add(key);

    let cancelled = false;
    setCommitsCache((prev) => ({ ...prev, [key]: { status: 'loading', error: null, commits: [], total: null } }));

    const targets = key === 'all' ? branches : branches.filter((b) => b.name === key);

    Promise.all(
      targets.map((b) => getRepositoryCommits(repositoryId, b._id).then((res) => ({ branch: b, res })))
    )
      .then((results) => {
        if (cancelled) return;
        const merged = new Map();
        let total = 0;
        for (const { branch, res } of results) {
          total += res.total ?? res.commits.length;
          for (const c of res.commits) {
            if (!merged.has(c.githubSha)) merged.set(c.githubSha, mapCommit(c, branch.name));
          }
        }
        const commits = [...merged.values()].sort(
          (a, b) => new Date(b.committedAtRaw).getTime() - new Date(a.committedAtRaw).getTime()
        );
        setCommitsCache((prev) => ({ ...prev, [key]: { status: 'ready', error: null, commits, total } }));
      })
      .catch((err) => {
        if (cancelled) return;
        requestedCommitKeys.current.delete(key); // allow a retry (e.g. after switching filter away and back)
        setCommitsCache((prev) => ({
          ...prev,
          [key]: {
            status: 'error',
            error: err.response?.data?.message || 'Failed to load commits.',
            commits: [],
            total: null,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchSyncStatus, branches, branchFilter]);

  // A file tree only ever belongs to one real branch -- 'all' (the
  // dropdown's default) resolves to the repository's default branch for
  // file-fetching purposes; any specific branch selection resolves to
  // that exact branch. `null` only when branches haven't loaded yet or
  // the selected name no longer matches a real branch.
  const resolvedFileBranch = useMemo(() => {
    if (branches.length === 0) return null;
    if (branchFilter === 'all') return branches.find((b) => b.isDefault) ?? branches[0];
    return branches.find((b) => b.name === branchFilter) ?? null;
  }, [branches, branchFilter]);

  // Fetches files for whichever real branch `resolvedFileBranch` currently
  // points at, once per branch `_id` (ref-guarded, same pattern as
  // commits). Keying the cache by branch `_id` -- not by the 'all'/name
  // filter string -- means a slower response for a previously-selected
  // branch can never land in the slot the UI is now reading from, since
  // each branch's result is written to its own key (instruction 5's
  // "prevent stale requests from overwriting a newer selection").
  useEffect(() => {
    if (!repositoryId || branchSyncStatus !== 'ready' || !resolvedFileBranch) return;
    const key = resolvedFileBranch._id;
    if (requestedFileKeys.current.has(key)) return;
    requestedFileKeys.current.add(key);

    let cancelled = false;
    setFilesCache((prev) => ({
      ...prev,
      [key]: { status: 'loading', error: null, files: [], count: null, truncated: false },
    }));

    getRepositoryFiles(repositoryId, key)
      .then((res) => {
        if (cancelled) return;
        setFilesCache((prev) => ({
          ...prev,
          [key]: { status: 'ready', error: null, files: res.files, count: res.count, truncated: Boolean(res.truncated) },
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        requestedFileKeys.current.delete(key); // allow a retry
        setFilesCache((prev) => ({
          ...prev,
          [key]: {
            status: 'error',
            error: err.response?.data?.message || 'Failed to load files.',
            files: [],
            count: null,
            truncated: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, branchSyncStatus, resolvedFileBranch]);

  // CommandCenterHeader/Sidebar expect `branch`/`lastUpdated`/`status`
  // fields; `status` is derived from the real branch-sync state (a
  // genuinely true signal), never a fabricated ready/indexed label the
  // backend never reported. `identity.repository` (Task 71) is the real,
  // backend-resolved identity for the URL's `repositoryId` -- replaces
  // the old `location.state.repo` source. Source Control has no
  // Dashboard-style richer fetch, so no override options are passed --
  // `useRepositoryHeader` (Task 77) falls back to
  // `identity.repository.defaultBranch`/`lastFetchedAt` exactly as this
  // page's own previous local `useMemo` already did.
  const headerRepo = useRepositoryHeader(identity, { syncStatus: branchSyncStatus });

  const commitsEntry = commitsCache[branchFilter] ?? { status: 'idle', error: null, commits: [], total: null };
  const filesEntry = resolvedFileBranch
    ? (filesCache[resolvedFileBranch._id] ?? { status: 'idle', error: null, files: [], count: null, truncated: false })
    : { status: 'idle', error: null, files: [], count: null, truncated: false };

  // Task 76: a real-file lookup for CommitDetailDrawer's changed-file
  // links, built from the exact same already-fetched `filesEntry.files`
  // the Files tab itself renders -- no second `/files` request, and no
  // new file-tree/lookup utility (Architecture's own `findNodeByPath`
  // does the actual tree resolution once the user gets there; this is
  // only a flat existence check so a changed file can honestly be marked
  // clickable or not). `null` -- not an empty Set -- while the file list
  // hasn't resolved yet, so "still loading" is never misread as "this
  // file doesn't exist" (§8, §11). Resolved against `resolvedFileBranch`
  // (the repository's default branch), the same branch Architecture
  // itself always resolves `?file=` against -- Architecture has no
  // per-branch view, so a commit from a different branch honestly can't
  // be validated against a tree Architecture couldn't show anyway.
  const validFilePaths = useMemo(() => {
    if (filesEntry.status !== 'ready') return null;
    return new Set(filesEntry.files.filter((f) => f.type === 'file').map((f) => f.path));
  }, [filesEntry.status, filesEntry.files]);

  const counts = {
    commits: commitsEntry.total,
    // `null` (renders "—"), not `0`, when there's no real repository to
    // have fetched branches for at all -- `0` would misleadingly read as
    // "this repository genuinely has zero branches".
    branches: repositoryId ? branches.length : null,
    // The real, unpaginated `count` from the files endpoint once loaded --
    // never the previous tab's array length, never fabricated while
    // loading/absent (instruction 7).
    files: filesEntry.status === 'ready' ? filesEntry.count : null,
    // No Pull Request model/controller/route exists anywhere in the
    // Express backend (confirmed by inspection) -- never a fabricated
    // number here (Task 57 §8/§9).
    pullRequests: null,
  };

  const showSkeleton = identity.status === 'loading';

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
            {showSkeleton ? 'Loading source control activity.' : 'Source control activity loaded.'}
          </p>

          {!repositoryId ? (
            <NoRepositoryState />
          ) : identity.status === 'not-found' ? (
            <RepositoryNotFoundState />
          ) : identity.status === 'error' ? (
            <SectionMessage text={identity.error || 'Failed to load this repository.'} tone="error" />
          ) : showSkeleton ? (
            <SourceControlSkeleton />
          ) : (
            <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
              {/* Task 69: AiInsightsPanel was repurposed to render real,
                  backend-generated repository analysis (Task 69's own
                  RepositoryAnalysisService contract) and can no longer
                  safely render Task 57's mock `data.insights` array. Real
                  analysis is out of Source Control's scope (Task 69's
                  mandate is the Dashboard only) -- rather than leave a
                  mock-data panel here or wire a second real-analysis
                  fetch into an unrelated page, this panel is removed from
                  Source Control entirely. See Task 69's final report,
                  Mock-Data Audit section. */}

              <IngestionAction
                repositoryId={repositoryId}
                repository={identity.repository}
                onRefreshRepository={identity.refresh}
                branchSyncStatus={branchSyncStatus}
                branchSyncError={branchSyncError}
                defaultBranch={resolvedFileBranch}
              />

              <section aria-label="Source control">
                {/* Task 92: Commit category breakdown — classifies the
                    already-fetched commits into Conventional Commit types.
                    Only shown when commits are loaded ('ready'). */}
                <CommitCategoryStrip
                  commits={commitsEntry.commits}
                  status={commitsEntry.status}
                />
                <SourceControlToolbar
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  counts={counts}
                  branches={branches}
                  branchFilter={branchFilter}
                  onBranchFilterChange={setBranchFilter}
                />

                <div role="tabpanel" id="panel-commits" aria-labelledby="tab-commits" hidden={activeTab !== 'commits'}>
                  {activeTab === 'commits' && (
                    <CommitsPanel
                      repositoryId={repositoryId}
                      entry={commitsEntry}
                      branchSyncStatus={branchSyncStatus}
                      branchSyncError={branchSyncError}
                      onOpenCommit={setOpenCommit}
                    />
                  )}
                </div>
                <div role="tabpanel" id="panel-branches" aria-labelledby="tab-branches" hidden={activeTab !== 'branches'}>
                  {activeTab === 'branches' && (
                    <BranchesPanel
                      repositoryId={repositoryId}
                      status={branchSyncStatus}
                      error={branchSyncError}
                      branches={branches}
                    />
                  )}
                </div>
                <div role="tabpanel" id="panel-files" aria-labelledby="tab-files" hidden={activeTab !== 'files'}>
                  {activeTab === 'files' && <FilesPanel repositoryId={repositoryId} entry={filesEntry} />}
                </div>
                <div role="tabpanel" id="panel-pullRequests" aria-labelledby="tab-pullRequests" hidden={activeTab !== 'pullRequests'}>
                  {activeTab === 'pullRequests' && <PullRequestsUnavailable />}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {copilotOpen && (
        <CopilotDrawer
          repository={headerRepo}
          repositoryId={repositoryId}
          suggestedQuestions={data.copilotSuggestedQuestions}
          onClose={() => setCopilotOpen(false)}
        />
      )}
      {openCommit && (
        <CommitDetailDrawer
          commit={openCommit}
          repositoryId={repositoryId}
          validFilePaths={validFilePaths}
          onClose={() => setOpenCommit(null)}
          onPreviewFile={(path) => setPreviewFilePath(path)}
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
    <div className="max-w-[560px] mx-auto mt-16 text-center">
      <p className="text-[13.5px] text-slate-500 leading-relaxed">
        Open this page from a real, synced repository (via Import Repository) to see its source control activity.
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

/**
 * `repositoryId === null` means there is no real, identity-bearing
 * repository to fetch anything for at all -- distinct from
 * `entry.status === 'idle'`/`'loading'`, which mean a real fetch hasn't
 * resolved *yet*. Collapsing the two previously left this panel showing
 * "Loading commits…" forever whenever no real repository existed to load
 * anything for (Task 57 live-verification finding).
 *
 * Commits can only ever be fetched once branch sync succeeds (a commit
 * request needs a real Branch `_id`, which only a successful
 * `getRepositoryBranches` call produces) -- so `entry` (keyed by
 * `commitsCache`) never even starts a fetch while `branchSyncStatus` isn't
 * `'ready'`, and previously stayed at its default `{status: 'idle'}`
 * forever whenever branch sync itself failed, which this panel rendered
 * identically to "still loading" -- an authentication failure (or any
 * other real branch-sync error) was indistinguishable from "hasn't
 * finished yet" and never surfaced here at all (confirmed live: GitHub
 * rejecting a revoked access token with a real 401 "Bad credentials" left
 * this panel spinning on "Loading commits…" indefinitely, even though the
 * real error was already being shown elsewhere on the page). `entry`'s own
 * `'error'` state (below) is a *different*, later failure -- the commits
 * call itself failing after branches loaded fine -- and is kept separate.
 */
function CommitsPanel({ repositoryId, entry, branchSyncStatus, branchSyncError, onOpenCommit }) {
  if (!repositoryId) {
    return <SectionMessage text="Open this page from a real, synced repository to see commits." />;
  }
  if (branchSyncStatus === 'error') {
    const isGithubAuthFailure = String(branchSyncError || '').startsWith('GitHub Authentication failed');
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center flex flex-col items-center gap-3">
        <AlertTriangle size={20} className="text-rose-400" aria-hidden="true" />
        <p className="text-[13px] text-rose-600 m-0">
          {isGithubAuthFailure
            ? 'Unable to load commits. GitHub authentication failed. Please reconnect GitHub.'
            : branchSyncError || 'Unable to load commits. Failed to synchronize branch information.'}
        </p>
        {isGithubAuthFailure && (
          <a
            href={`${API_BASE_URL}/api/auth/github`}
            className="text-[12.5px] font-semibold text-blue-600 hover:text-blue-700"
          >
            Reconnect GitHub
          </a>
        )}
      </div>
    );
  }
  if (entry.status === 'loading' || entry.status === 'idle') {
    return <SectionMessage text="Loading commits…" />;
  }
  if (entry.status === 'error') {
    return <SectionMessage text={entry.error || 'Failed to load commits.'} tone="error" />;
  }
  return <CommitList commits={entry.commits} onOpenCommit={onOpenCommit} />;
}

function BranchesPanel({ repositoryId, status, error, branches }) {
  if (!repositoryId) {
    return <SectionMessage text="Open this page from a real, synced repository to see branches." />;
  }
  if (status === 'loading' || status === 'idle') {
    return <SectionMessage text="Loading branches…" />;
  }
  if (status === 'error') {
    return <SectionMessage text={error || 'Failed to load branches.'} tone="error" />;
  }
  return <BranchList branches={branches} />;
}

/**
 * Task 58: real files from `GET .../branches/:branchId/files`. Same
 * repositoryId-vs-loading distinction as CommitsPanel/BranchesPanel --
 * "no real repository" and "still fetching" are different states, not
 * collapsed into one perpetual spinner.
 */
function FilesPanel({ repositoryId, entry }) {
  if (!repositoryId) {
    return <SectionMessage text="Open this page from a real, synced repository to see files." />;
  }
  if (entry.status === 'loading' || entry.status === 'idle') {
    return <SectionMessage text="Loading files…" />;
  }
  if (entry.status === 'error') {
    return <SectionMessage text={entry.error || 'Failed to load files.'} tone="error" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {entry.truncated && (
        <p className="text-[11.5px] text-amber-400 m-0">
          This branch's file tree is larger than GitHub returned in one call — the list below may be incomplete.
        </p>
      )}
      <FileList files={entry.files} />
    </div>
  );
}

function SectionMessage({ text, tone = 'default' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
      <p className={`text-[13px] m-0 ${tone === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{text}</p>
    </div>
  );
}

/**
 * Task 57 §8/§20: no Pull Request model, controller, or route exists in
 * the Express backend -- confirmed by inspecting backend/src/models/,
 * backend/src/controllers/, and backend/src/routes/ before implementing
 * anything here. Rather than invent PR data, this is an honest empty
 * state, matching CommitList's own "no commits yet" visual pattern.
 */
function PullRequestsUnavailable() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
      <GitPullRequest size={20} className="text-slate-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-[13px] text-slate-500 m-0">Pull request data is not available yet.</p>
    </div>
  );
}

/**
 * Task 44/45: triggers `POST /api/github/repositories/:repositoryId/ingest`.
 * Never sends a workspaceId -- the backend derives it exclusively from
 * `Repository.workspaceId` (Task 44). Every status code that endpoint can
 * return (202/200/400/404/409/502, plus 401 from the auth middleware) gets
 * a clear, distinct message here -- none are swallowed.
 *
 * Task 50: the button also stays disabled until `branchSyncStatus` is
 * `'ready'` -- ingestion requires a persisted Branch document that only a
 * successful branch sync creates (Task 49's finding), so requesting
 * ingestion before that completes would just reproduce the known 400.
 *
 * Task 57: there is no ingestion-status GET endpoint anywhere in Express
 * (confirmed by inspecting backend/src/routes/) and the frontend must not
 * read Redis directly -- so this component still only ever reflects the
 * single ingest response it receives, never a live/polled READY state.
 */
function IngestionAction({
  repositoryId,
  repository,
  onRefreshRepository,
  branchSyncStatus,
  branchSyncError,
  defaultBranch,
}) {
  const [requesting, setRequesting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const requestingRef = useRef(false);

  const ingestionStatus = repository?.ingestionStatus || 'pending';
  const ingestionStage = repository?.ingestionStage;
  const chunkCount = repository?.chunkCount || 0;
  const lastIngestedAt = repository?.lastIngestedAt;
  const ingestionError = repository?.ingestionError;
  const lastIngestedCommitSha = repository?.lastIngestedCommitSha;

  const currentCommitSha = defaultBranch?.latestCommitSha;
  const isCurrentCommitIngested =
    ingestionStatus === 'completed' &&
    Boolean(lastIngestedCommitSha) &&
    Boolean(currentCommitSha) &&
    lastIngestedCommitSha === currentCommitSha;

  const isStaleCommit =
    ingestionStatus === 'completed' &&
    Boolean(lastIngestedCommitSha) &&
    Boolean(currentCommitSha) &&
    lastIngestedCommitSha !== currentCommitSha;

  // Poll repository status while processing
  useEffect(() => {
    if (ingestionStatus !== 'processing' || !onRefreshRepository) return;
    const intervalId = setInterval(() => {
      onRefreshRepository();
    }, 4000);
    return () => clearInterval(intervalId);
  }, [ingestionStatus, onRefreshRepository]);

  const handleRequestIngestion = async () => {
    if (
      !repositoryId ||
      branchSyncStatus !== 'ready' ||
      requestingRef.current ||
      requesting ||
      ingestionStatus === 'processing'
    ) {
      return;
    }

    requestingRef.current = true;
    setRequesting(true);
    setActionError(null);

    try {
      await ingestRepository(repositoryId);
      if (onRefreshRepository) {
        await onRefreshRepository();
      }
    } catch (err) {
      const httpStatus = err.response?.status;
      const backendMessage = err.response?.data?.message;
      let message;
      if (httpStatus === 401) message = 'Your session has expired. Please log in again.';
      else if (httpStatus === 404) message = backendMessage || 'Repository not found or access denied.';
      else if (httpStatus === 409) {
        message =
          backendMessage ||
          'This repository is not associated with a workspace. Associate it with a workspace before requesting ingestion.';
      } else if (httpStatus === 400) message = backendMessage || 'This repository cannot be ingested yet.';
      else message = backendMessage || 'Ingestion request failed. Please try again.';
      setActionError(message);
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  };

  const branchSyncReady = branchSyncStatus === 'ready';
  const disabled =
    !repositoryId ||
    !branchSyncReady ||
    requesting ||
    ingestionStatus === 'processing' ||
    isCurrentCommitIngested;

  let helperText;
  if (!repositoryId) {
    helperText = "This repository wasn't opened from a real, synced source, so ingestion isn't available here.";
  } else if (branchSyncStatus === 'loading' || branchSyncStatus === 'idle') {
    helperText = 'Synchronizing branch information from GitHub before ingestion can start…';
  } else if (branchSyncStatus === 'error') {
    helperText = branchSyncError || 'Failed to synchronize branch information. Please try again.';
  } else if (ingestionStatus === 'processing') {
    helperText = `AI Ingestion in progress… Stage: ${ingestionStage || 'processing'}`;
  } else if (isCurrentCommitIngested) {
    helperText = `Repository is fully ingested for commit ${lastIngestedCommitSha.slice(0, 7)}${
      chunkCount > 0 ? ` (${chunkCount} vector chunks indexed)` : ''
    }.`;
  } else if (isStaleCommit) {
    helperText = `Ingested for commit ${lastIngestedCommitSha.slice(0, 7)}. New commit ${currentCommitSha.slice(
      0,
      7
    )} available for ingestion.`;
  } else if (ingestionStatus === 'failed') {
    helperText = `Ingestion failed: ${ingestionError || 'Unknown error'}. Click to retry.`;
  } else {
    helperText = 'Index this repository so SEIS AI Copilot can answer questions about it.';
  }

  let buttonText = 'Request AI Ingestion';
  if (requesting) buttonText = 'Requesting…';
  else if (branchSyncStatus === 'loading') buttonText = 'Syncing branches…';
  else if (ingestionStatus === 'processing') buttonText = 'Ingestion Processing…';
  else if (isCurrentCommitIngested) buttonText = 'Ingested (Up to Date)';
  else if (isStaleCommit) buttonText = 'Ingest New Commit';
  else if (ingestionStatus === 'failed') buttonText = 'Retry Ingestion';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 sm:px-5 py-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-semibold text-slate-900 m-0">AI Ingestion</p>
            {ingestionStatus === 'completed' && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                READY
              </span>
            )}
            {ingestionStatus === 'processing' && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> PROCESSING
              </span>
            )}
            {ingestionStatus === 'failed' && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                FAILED
              </span>
            )}
          </div>
          <p
            className={`text-[12.5px] mt-1 m-0 ${
              ingestionStatus === 'failed' || branchSyncStatus === 'error' ? 'text-rose-600' : 'text-slate-500'
            }`}
          >
            {helperText}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRequestIngestion}
          disabled={disabled}
          aria-busy={requesting || branchSyncStatus === 'loading' || ingestionStatus === 'processing'}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[13px] font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {requesting || branchSyncStatus === 'loading' || ingestionStatus === 'processing' ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : isCurrentCommitIngested ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          {buttonText}
        </button>
      </div>

      {actionError && (
        <p role="status" className="text-[12.5px] flex items-center gap-1.5 m-0 text-rose-600">
          <AlertTriangle size={13} aria-hidden="true" />
          {actionError}
        </p>
      )}
    </div>
  );
}

function SourceControlSkeleton() {
  return (
    <div className="max-w-[1000px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="h-28 rounded-xl bg-slate-100 border border-slate-200 mb-6" />
      <div className="h-9 w-64 rounded-lg bg-slate-100 border border-slate-200 mb-4" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 border border-slate-200" />
        ))}
      </div>
    </div>
  );
}
