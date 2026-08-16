import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildSourceControlData } from '../services/sourceControlMockData';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';
import AiInsightsPanel from '../components/commandCenter/AiInsightsPanel';
import SourceControlToolbar from '../components/sourceControl/SourceControlToolbar';
import CommitList from '../components/sourceControl/CommitList';
import CommitDetailDrawer from '../components/sourceControl/CommitDetailDrawer';
import BranchList from '../components/sourceControl/BranchList';
import PullRequestList from '../components/sourceControl/PullRequestList';
import PullRequestDetailDrawer from '../components/sourceControl/PullRequestDetailDrawer';

/**
 * MOCK ONLY — used when this page is opened directly (no router state).
 * No auth guard exists yet in this frontend-only phase, so the page must
 * still render something sensible.
 */
const DEFAULT_REPO = {
  name: 'seis-ai-copilot',
  owner: 'seis-ai',
  language: 'JavaScript',
};

export default function SourceControlPage() {
  const location = useLocation();
  const sourceRepo = location.state?.repo ?? DEFAULT_REPO;

  const data = useMemo(() => buildSourceControlData(sourceRepo), [sourceRepo]);

  // CommandCenterHeader/Sidebar expect `branch`/`lastUpdated` fields (their
  // shared shape from commandCenterMockData) — adapted here locally rather
  // than changing either shared component's expected props.
  const headerRepo = useMemo(
    () => ({ ...data.repository, branch: data.repository.defaultBranch, lastUpdated: 'Updated 3 hours ago' }),
    [data.repository]
  );

  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('commits');
  const [branchFilter, setBranchFilter] = useState('all');
  const [openCommit, setOpenCommit] = useState(null);
  const [openPr, setOpenPr] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 550);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredCommits = useMemo(
    () => (branchFilter === 'all' ? data.commits : data.commits.filter((c) => c.branch === branchFilter)),
    [data.commits, branchFilter]
  );

  const counts = {
    commits: data.commits.length,
    branches: data.branches.length,
    pullRequests: data.pullRequests.length,
  };

  return (
    <div className="min-h-screen w-full bg-[#0F172A] flex">
      <CommandCenterSidebar
        repository={headerRepo}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <CommandCenterHeader
          repository={headerRepo}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCopilot={() => setCopilotOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 py-6">
          <p className="sr-only" role="status" aria-live="polite">
            {loading ? 'Loading source control activity.' : 'Source control activity loaded.'}
          </p>

          {loading ? (
            <SourceControlSkeleton />
          ) : (
            <div className="max-w-[1000px] mx-auto flex flex-col gap-6">
              <AiInsightsPanel insights={data.insights} />

              <section aria-label="Source control">
                <SourceControlToolbar
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  counts={counts}
                  branches={data.branches}
                  branchFilter={branchFilter}
                  onBranchFilterChange={setBranchFilter}
                />

                <div role="tabpanel" id="panel-commits" aria-labelledby="tab-commits" hidden={activeTab !== 'commits'}>
                  {activeTab === 'commits' && <CommitList commits={filteredCommits} onOpenCommit={setOpenCommit} />}
                </div>
                <div role="tabpanel" id="panel-branches" aria-labelledby="tab-branches" hidden={activeTab !== 'branches'}>
                  {activeTab === 'branches' && <BranchList branches={data.branches} />}
                </div>
                <div role="tabpanel" id="panel-pullRequests" aria-labelledby="tab-pullRequests" hidden={activeTab !== 'pullRequests'}>
                  {activeTab === 'pullRequests' && (
                    <PullRequestList pullRequests={data.pullRequests} onOpenPr={setOpenPr} />
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {copilotOpen && (
        <CopilotDrawer
          repository={data.repository}
          suggestedQuestions={data.copilotSuggestedQuestions}
          onClose={() => setCopilotOpen(false)}
        />
      )}
      {openCommit && <CommitDetailDrawer commit={openCommit} onClose={() => setOpenCommit(null)} />}
      {openPr && <PullRequestDetailDrawer pr={openPr} onClose={() => setOpenPr(null)} />}
    </div>
  );
}

function SourceControlSkeleton() {
  return (
    <div className="max-w-[1000px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="h-28 rounded-xl bg-[#111A2C] border border-[#1E293B] mb-6" />
      <div className="h-9 w-64 rounded-lg bg-[#111A2C] border border-[#1E293B] mb-4" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-[#111A2C] border border-[#1E293B]" />
        ))}
      </div>
    </div>
  );
}
