import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Activity,
  Settings,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listWorkspaces, getActiveWorkspace } from '../services/workspaceService';
import FadeIn from '../components/common/FadeIn';
import AuthenticatedAppShell from '../components/layout/AuthenticatedAppShell';
import AppDashboardHeader from '../components/layout/AppDashboardHeader';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';

const PLACEHOLDER_REPO = {
  name: '—',
  owner: '',
  branch: '—',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listWorkspaces()
      .then((data) => {
        if (!cancelled) {
          setWorkspaces(data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navRepositoryId = useMemo(() => {
    const ws = getActiveWorkspace();
    const fromWs = ws?.defaultRepositoryId;
    if (fromWs) {
      return typeof fromWs === 'object' ? fromWs._id : fromWs;
    }
    const withRepo = workspaces.find((w) => w.defaultRepositoryId);
    if (!withRepo?.defaultRepositoryId) return null;
    const dr = withRepo.defaultRepositoryId;
    return typeof dr === 'object' ? dr._id : dr;
  }, [workspaces]);

  const sidebarRepository = useMemo(() => {
    if (!navRepositoryId) return PLACEHOLDER_REPO;
    const ws = getActiveWorkspace();
    const fullName = ws?.defaultRepositoryName;
    if (fullName && fullName.includes('/')) {
      const [owner, name] = fullName.split('/');
      return { name: name || fullName, owner: owner || '…', branch: 'main' };
    }
    const populated = workspaces
      .map((w) => w.defaultRepositoryId)
      .find((dr) => dr && (typeof dr === 'object' ? dr._id === navRepositoryId : dr === navRepositoryId));
    if (populated && typeof populated === 'object') {
      const owner = populated.owner || populated.fullName?.split('/')[0] || '…';
      const name = populated.name || populated.fullName?.split('/').pop() || 'Repository';
      return { name, owner, branch: populated.defaultBranch || 'main' };
    }
    return { name: fullName || 'Repository', owner: '…', branch: 'main' };
  }, [navRepositoryId, workspaces]);

  const activeProjects = workspaces.filter((w) => w.defaultRepositoryId).length;

  return (
    <AuthenticatedAppShell
      sidebar={
        <CommandCenterSidebar
          repository={sidebarRepository}
          repositoryId={navRepositoryId}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      }
    >
      <AppDashboardHeader title="Dashboard" onOpenMobileNav={() => setMobileNavOpen(true)} />

      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <FadeIn>
          <div className="max-w-6xl mx-auto space-y-8">
            <section className="bg-white dark:bg-[#111827] rounded-2xl p-8 border border-[#E2E8F0] dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="relative z-10">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Welcome back, {user?.githubUsername || 'Developer'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 max-w-2xl text-sm sm:text-base">
                  Here&apos;s what&apos;s happening in your engineering workspaces today. Manage connected repositories
                  and jump into Architecture, Insights, or Source Control from the sidebar.
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <StatCard
                title="Total Workspaces"
                value={loading ? '...' : workspaces.length}
                subtitle="Created on your account"
              />
              <StatCard
                title="Active Repositories"
                value={loading ? '...' : activeProjects}
                subtitle="Repositories connected to workspaces"
              />
              <StatCard title="Team Members" value="1" subtitle="You are the only member" />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Activity</h2>
                <div className="bg-white dark:bg-[#111827] rounded-xl border border-[#E2E8F0] dark:border-slate-800 shadow-sm p-8 text-center">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <Activity size={20} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No recent activity</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your recent actions and analysis runs will appear here.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quick Actions</h2>
                <div className="bg-white dark:bg-[#111827] rounded-xl border border-[#E2E8F0] dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                  <QuickAction icon={Plus} title="Create Workspace" onClick={() => navigate('/workspace')} />
                  <div className="h-px w-full bg-[#E2E8F0] dark:bg-slate-800" />
                  <QuickAction icon={FolderGit2} title="View Workspaces" onClick={() => navigate('/workspace')} />
                  <div className="h-px w-full bg-[#E2E8F0] dark:bg-slate-800" />
                  <QuickAction
                    icon={Settings}
                    title="Import Repository"
                    onClick={() => navigate('/import-repository')}
                  />
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </main>
    </AuthenticatedAppShell>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="bg-white dark:bg-[#111827] rounded-xl p-6 border border-[#E2E8F0] dark:border-slate-800 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{title}</h3>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{value}</div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
          <Icon size={16} />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
      </div>
      <ArrowRight size={16} className="text-slate-400" />
    </button>
  );
}
