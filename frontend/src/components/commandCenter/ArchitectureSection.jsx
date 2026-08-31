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
    <section id="architecture" className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <Boxes size={15} className="text-blue-600" aria-hidden="true" />
        <h2 className="text-[13.5px] font-bold text-slate-900">Repository Structure</h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        {!available || (directories.length === 0 && rootFileCount === 0) ? (
          <div className="py-6 text-center">
            <FolderTree size={20} className="text-slate-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-[13px] text-slate-400 m-0">
              Repository structure is not available yet — sync files from Source Control to see it here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-slate-400 mb-3 m-0">
              Real top-level directories, sized by number of files actually synced from GitHub.
            </p>
            <ul className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
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
        className={`w-[168px] shrink-0 text-[12px] font-mono truncate ${muted ? 'text-slate-400 italic' : 'text-slate-600'}`}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded ${muted ? 'bg-slate-300' : 'bg-blue-600'}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] font-mono text-slate-400 tabular-nums">
        {count} file{count === 1 ? '' : 's'}
      </span>
    </li>
  );
}
