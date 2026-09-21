import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, GitCommitHorizontal } from 'lucide-react';
import DetailDrawer from './DetailDrawer';

// Compact by design (same precedent as AiInsightsPanel's
// MAX_VISIBLE_HOTSPOTS, Task 74) -- a large merge commit can carry dozens
// of real changed files; the full real list is always available via
// "Show all", never truncated silently or replaced with a fabricated count.
const MAX_VISIBLE_CHANGED_FILES = 8;

/**
 * Task 76: `commit.files` (mapped from the real `Commit.filesChanged`
 * array, `backend/src/models/commits.model.js`) is only ever non-empty
 * for a commit that has actually been enriched with a real GitHub
 * single-commit-detail fetch -- confirmed by inspection
 * (`backend/src/services/analysisPreparation.service.js`'s
 * `enrichCommitsWithFileChanges`, run as a side effect of generating AI
 * Insights): the commits *list* endpoint this page's own `getCommits`
 * call uses only ever returns GitHub's list-commits API response, which
 * never includes per-commit files, so a commit that has never been
 * touched by that enrichment step genuinely has `filesChanged: []` in
 * Mongo -- not a frontend gap, a real absence of data. Shown as an
 * honest "not available" message instead of a misleading "0 files
 * changed" header, which would read as "this commit touched nothing"
 * rather than "this data was never fetched."
 */
export default function CommitDetailDrawer({ commit, repositoryId, validFilePaths, onClose, onPreviewFile }) {
  return (
    <DetailDrawer titleId="commit-drawer-title" title={commit.shortHash} icon={GitCommitHorizontal} onClose={onClose}>
      <p className="text-[14.5px] font-semibold text-slate-900 leading-snug mb-3">{commit.message}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-500 mb-5">
        <span>{commit.author.name}</span>
        <span>{commit.timestamp}</span>
        <span className="font-mono text-slate-400">{commit.branch}</span>
      </div>

      <div className="flex items-center gap-4 text-[12.5px] font-mono mb-5">
        {commit.additions != null && commit.deletions != null ? (
          <>
            <span className="text-emerald-600">+{commit.additions} additions</span>
            <span className="text-rose-600">-{commit.deletions} deletions</span>
          </>
        ) : (
          <span className="text-slate-400">Statistics not available</span>
        )}
      </div>

      {commit.files.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3">
          <p className="text-[12.5px] text-slate-400 m-0">Changed files are not available for this commit.</p>
        </div>
      ) : (
        <ChangedFilesList
          commit={commit}
          repositoryId={repositoryId}
          validFilePaths={validFilePaths}
          onPreviewFile={onPreviewFile}
        />
      )}
    </DetailDrawer>
  );
}

function ChangedFilesList({ commit, repositoryId, validFilePaths, onPreviewFile }) {
  const [showAll, setShowAll] = useState(false);
  const visibleFiles = showAll ? commit.files : commit.files.slice(0, MAX_VISIBLE_CHANGED_FILES);
  const remaining = commit.files.length - visibleFiles.length;

  return (
    <>
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        {commit.files.length} file{commit.files.length === 1 ? '' : 's'} changed
      </span>
      <ul className="flex flex-col gap-1.5">
        {visibleFiles.map((f) => (
          <ChangedFileRow
            key={f.path}
            file={f}
            repositoryId={repositoryId}
            resolvable={validFilePaths ? validFilePaths.has(f.path) : null}
            onPreviewFile={onPreviewFile}
          />
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-[11.5px] font-semibold text-blue-600 hover:text-blue-700 bg-transparent border-0 p-0 cursor-pointer"
        >
          +{remaining} more file{remaining === 1 ? '' : 's'}
        </button>
      )}
    </>
  );
}

function ChangedFileRow({ file, repositoryId, resolvable, onPreviewFile }) {
  if (repositoryId && resolvable === true) {
    return (
      <li className="flex items-center justify-between gap-2 max-w-full bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        {onPreviewFile ? (
          <button
            type="button"
            onClick={() => onPreviewFile(file.path)}
            aria-label={`Preview ${file.path}`}
            className="text-[12px] font-mono text-blue-700 hover:text-blue-900 hover:underline truncate text-left bg-transparent border-0 p-0 cursor-pointer"
            title={`Preview ${file.path}`}
          >
            {file.path}
          </button>
        ) : (
          <span className="text-[12px] font-mono text-blue-700 truncate">{file.path}</span>
        )}
        <Link
          to={`/architecture/${repositoryId}?file=${encodeURIComponent(file.path)}`}
          aria-label={`Open ${file.path} in Architecture`}
          className="text-blue-600 hover:text-blue-800 shrink-0"
          title="Open in Architecture"
        >
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-0.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-mono text-slate-700 truncate">{file.path}</span>
        {/* Task 57: real Commit.filesChanged is a list of paths only --
            GitHub's per-file +/- stats aren't persisted, so the badge
            is omitted rather than showing fabricated counts. */}
        {file.additions != null && file.deletions != null && (
          <span className="text-[11px] font-mono shrink-0">
            <span className="text-emerald-600">+{file.additions}</span>{' '}
            <span className="text-rose-600">-{file.deletions}</span>
          </span>
        )}
      </div>
      {/* Only a definitively-resolved miss (`resolvable === false`) gets
          this label -- `resolvable === null` (the file list hasn't
          loaded yet) stays unlabeled, since "not yet checked" is not the
          same claim as "confirmed absent" (§7, §14). */}
      {resolvable === false && (
        <span className="text-[10.5px] text-slate-400">Not available in the current repository structure</span>
      )}
    </li>
  );
}
