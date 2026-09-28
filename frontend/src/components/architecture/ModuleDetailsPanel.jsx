import React, { useMemo } from 'react';
import { File, Folder } from 'lucide-react';
import { countFilesUnder, filePathsUnder, languageBreakdownUnder } from '../../utils/buildRepositoryTree';

function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Real details for whichever tree node is selected -- every count/
 * language/file listed here is derived from the same real file list the
 * tree itself was built from (Task 69). Selecting nothing (the initial
 * state) shows an honest prompt rather than an empty box.
 */
export default function ModuleDetailsPanel({ node }) {
  const fileCount = useMemo(() => (node ? countFilesUnder(node) : 0), [node]);
  const languages = useMemo(() => (node ? languageBreakdownUnder(node) : []), [node]);
  const files = useMemo(() => (node ? filePathsUnder(node) : []), [node]);

  if (!node) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
        <p className="text-[13px] text-slate-500 m-0">Select a directory or file to see its details.</p>
      </div>
    );
  }

  const isDirectory = node.type === 'directory';

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 min-w-0">
        {isDirectory ? (
          <Folder size={15} className="text-blue-500 shrink-0" aria-hidden="true" />
        ) : (
          <File size={15} className="text-slate-400 shrink-0" aria-hidden="true" />
        )}
        <span className="text-[13px] font-mono font-semibold text-slate-900 truncate" title={node.path}>
          {node.path}
        </span>
      </div>

      {isDirectory ? (
        <>
          <div className="flex gap-4 text-[12px] text-slate-500">
            <span>
              <span className="text-slate-900 font-semibold tabular-nums">{fileCount}</span> file{fileCount === 1 ? '' : 's'}
            </span>
          </div>

          {languages.length > 0 && (
            <div>
              <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Languages
              </span>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((l) => (
                  <span
                    key={l.language}
                    className="text-[11px] text-slate-600 bg-slate-100 rounded-full px-2 py-0.5 font-mono"
                  >
                    {l.language} <span className="text-slate-400">{l.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Contained Files
            </span>
            <ul className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1 divide-y divide-slate-100">
              {files.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-2 text-[11.5px] font-mono py-1">
                  <span className="text-slate-600 truncate">{f.path}</span>
                  <span className="text-slate-400 shrink-0">{formatSize(f.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="flex gap-4 text-[12px] text-slate-500">
          {node.language && <span>Language: <span className="text-slate-700 font-medium">{node.language}</span></span>}
          {formatSize(node.size) && <span>Size: <span className="text-slate-700 font-medium">{formatSize(node.size)}</span></span>}
        </div>
      )}
    </div>
  );
}
