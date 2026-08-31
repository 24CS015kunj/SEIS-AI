import React, { useMemo } from 'react';
import { GitCommit, Zap, Bug, RefreshCw, Wrench, BookOpen, TestTube, TrendingUp, Settings, Circle } from 'lucide-react';

/**
 * Task 92: Commit Category Breakdown strip.
 *
 * Classifies each loaded commit's message using the same Conventional Commits
 * pattern the backend's `CommitAnalyzer` already applies server-side (Task 25).
 * Done client-side here to avoid any backend change — `commits` are the already-
 * fetched, real commit objects from the Source Control page's `commitsCache`.
 *
 * Classification follows the same prefix table as `CommitAnalyzer._COMMIT_TYPE_MAP`
 * (fastapi-ai-service/app/core/evolution/commit_analyzer.py):
 *   feat, fix, refactor, chore, docs, test, perf, style, build, ci, revert → OTHER
 *
 * A commit with no recognizable prefix falls into "Other". No commit is re-
 * classified differently from what the backend would produce.
 *
 * Props:
 *   commits  — real commit objects from commitsCache (already mapped by mapCommit)
 *   status   — 'idle' | 'loading' | 'ready' | 'error'
 */
export default function CommitCategoryStrip({ commits, status }) {
  const breakdown = useMemo(() => classifyCommits(commits), [commits]);

  if (status !== 'ready' || commits.length === 0) return null;

  const total = breakdown.total;
  const visibleCategories = CATEGORIES.filter((c) => breakdown.counts[c.key] > 0);

  return (
    <div
      id="commit-category-strip"
      className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4"
      aria-label="Commit category breakdown"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <GitCommit size={14} className="text-blue-600 shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-bold text-slate-900">Commit Activity</span>
        <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{total} commit{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Stacked bar */}
      <StackedBar breakdown={breakdown} total={total} />

      {/* Legend */}
      {visibleCategories.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {visibleCategories.map((cat) => {
            const count = breakdown.counts[cat.key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <LegendItem key={cat.key} cat={cat} count={count} pct={pct} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Stacked bar ─────────────────────────────────────────────────────────────

function StackedBar({ breakdown, total }) {
  if (total === 0) return null;
  return (
    <div
      className="flex w-full h-2 rounded-full overflow-hidden gap-px"
      role="img"
      aria-label="Commit type distribution bar"
    >
      {CATEGORIES.map((cat) => {
        const count = breakdown.counts[cat.key];
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={cat.key}
            style={{ width: `${pct}%`, backgroundColor: cat.color }}
            title={`${cat.label}: ${count} (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>
  );
}

function LegendItem({ cat, count, pct }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} aria-hidden="true" />
      <span className="text-[11.5px] text-slate-600 font-medium">{cat.label}</span>
      <span className="text-[11px] tabular-nums text-slate-400">{count}</span>
      <span className="text-[10.5px] text-slate-300 tabular-nums">({pct}%)</span>
    </div>
  );
}

// ─── Classification ───────────────────────────────────────────────────────────

// Same Conventional Commits regex as CommitAnalyzer (Task 25)
const CC_PATTERN = /^([a-zA-Z]+)(?:\([^)]*\))?!?:\s/;

// Map type → category key (matching CommitAnalyzer._COMMIT_TYPE_MAP exactly)
const TYPE_TO_KEY = {
  feat: 'feat',
  fix: 'fix',
  refactor: 'refactor',
  chore: 'chore',
  docs: 'docs',
  test: 'test',
  perf: 'perf',
  style: 'style',
  build: 'build',
  ci: 'chore',   // group ci into chore like many analytics tools do
  revert: 'other',
};

function classifyCommit(message) {
  if (!message) return 'other';
  const match = CC_PATTERN.exec(message.trim());
  if (!match) return 'other';
  return TYPE_TO_KEY[match[1].toLowerCase()] ?? 'other';
}

function classifyCommits(commits) {
  const counts = { feat: 0, fix: 0, refactor: 0, chore: 0, docs: 0, test: 0, perf: 0, style: 0, build: 0, other: 0 };
  for (const c of commits) {
    const key = classifyCommit(c.message);
    if (key in counts) counts[key]++;
  }
  return { counts, total: commits.length };
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'feat',    label: 'Features',    color: '#2563eb', icon: Zap       },
  { key: 'fix',     label: 'Bug Fixes',   color: '#ef4444', icon: Bug       },
  { key: 'refactor',label: 'Refactor',    color: '#8b5cf6', icon: RefreshCw },
  { key: 'chore',   label: 'Chores',      color: '#94a3b8', icon: Wrench    },
  { key: 'docs',    label: 'Docs',        color: '#0ea5e9', icon: BookOpen  },
  { key: 'test',    label: 'Tests',       color: '#10b981', icon: TestTube  },
  { key: 'perf',    label: 'Performance', color: '#f97316', icon: TrendingUp},
  { key: 'style',   label: 'Style',       color: '#ec4899', icon: Settings  },
  { key: 'build',   label: 'Build',       color: '#a1a1aa', icon: Settings  },
  { key: 'other',   label: 'Other',       color: '#d1d5db', icon: Circle    },
];
