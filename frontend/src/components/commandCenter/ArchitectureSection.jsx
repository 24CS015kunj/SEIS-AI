import React, { useMemo } from 'react';
import { Boxes, FolderTree } from 'lucide-react';

/**
 * Task 68: this section previously rendered a fully fabricated dependency
 * graph (hardcoded nodes like "services/"/"auth/", invented "risk" levels,
 * and invented edges implying import relationships between directories).
 * None of that is derivable from repository file paths alone -- a
 * directory containing many files says nothing about what imports what.
 *
 * What real, already-indexed file paths *do* honestly support is a
 * top-level directory breakdown with real file counts, which is what this
 * renders: one real bar per real top-level directory, sized relative to
 * the largest, plus the real root-level file count. No relationships, no
 * risk labels, no circular-dependency claim -- none of that data exists.
 */
export default function ArchitectureSection({ available, directories, rootFileCount }) {
  const maxCount = useMemo(
    () => Math.max(rootFileCount, ...directories.map((d) => d.fileCount), 1),
    [directories, rootFileCount]
  );

  return (
    <section id="architecture" className="apple-card rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-xs overflow-hidden scroll-mt-20">
      {/* Integrated Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#111827]">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0071E3] dark:text-blue-400 flex items-center justify-center shrink-0">
            <Boxes size={14} aria-hidden="true" />
          </span>
          <h2 className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 m-0">Repository Structure</h2>
        </div>
        {available && (directories.length > 0 || rootFileCount > 0) && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700">
            {directories.length + (rootFileCount > 0 ? 1 : 0)} entries
          </span>
        )}
      </div>

      <div className="p-4">
        {!available || (directories.length === 0 && rootFileCount === 0) ? (
          <div className="py-6 text-center">
            <FolderTree size={20} className="text-slate-400 dark:text-slate-500 mx-auto mb-2" aria-hidden="true" />
            <p className="text-[12px] font-mono text-slate-500 dark:text-slate-400 m-0">
              Repository structure is not available yet — sync files from Source Control to see it here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11.5px] font-mono text-slate-500 dark:text-slate-400 mb-3.5 m-0">
              Real top-level directories, sized by number of files actually synced from GitHub.
            </p>
            <ul className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1 list-none p-0 m-0">
              {rootFileCount > 0 && (
                <DirectoryRow label="(repository root)" count={rootFileCount} max={maxCount} muted />
              )}
              {directories.map((d) => (
                <DirectoryRow key={d.path} label={`${d.path}/`} count={d.fileCount} max={maxCount} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function DirectoryRow({ label, count, max, muted = false }) {
  const widthPercent = Math.max((count / max) * 100, 4);
  return (
    <li className="flex items-center gap-3">
      <span
        className={`w-[168px] shrink-0 text-[12.5px] font-mono truncate ${muted ? 'text-[#86868B] dark:text-slate-500 italic' : 'text-[#1D1D1F] dark:text-slate-200 font-medium'}`}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-black/[0.04] dark:bg-slate-800 overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${muted ? 'bg-black/20 dark:bg-slate-700' : 'bg-[#0071E3]'}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[12px] font-mono text-[#86868B] dark:text-slate-400 tabular-nums">
        {count} file{count === 1 ? '' : 's'}
      </span>
    </li>
  );
}
