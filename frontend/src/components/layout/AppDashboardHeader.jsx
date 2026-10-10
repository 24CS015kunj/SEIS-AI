import React from 'react';
import { Menu, ChevronDown } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';

/**
 * Top bar for workspace-level pages (e.g. /dashboard) — matches Command
 * Center header height and theme tokens without repository switcher.
 */
export default function AppDashboardHeader({ title = 'Dashboard', onOpenMobileNav }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 sm:px-6 border-b border-[#E2E8F0] dark:border-slate-800 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl shrink-0 transition-colors duration-200">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          className="lg:hidden w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 m-0">Pages</p>
          <h1 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate m-0">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <ThemeToggle />
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              {user?.githubUsername?.slice(0, 2).toUpperCase() || 'U'}
            </div>
          )}
          <div className="text-left min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
              {user?.name || user?.githubUsername || 'Developer'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate">
              @{user?.githubUsername}
            </div>
          </div>
          <ChevronDown size={14} className="text-slate-400 hidden md:block" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}
