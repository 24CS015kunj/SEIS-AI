import React from 'react';
import { File, Folder } from 'lucide-react';

/** Formats a byte count using real data only -- never shown for a
 * directory, which has no meaningful size (Task 58). */
function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileRow({ file }) {
  const isDirectory = file.type === 'directory';
  return (
    <li className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-3.5 py-3">
      <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        {isDirectory ? (
          <Folder size={13} className="text-blue-600" aria-hidden="true" />
        ) : (
          <File size={13} className="text-slate-400" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[12.5px] font-mono text-slate-700 truncate block">{file.path}</span>
      </div>
      <div className="hidden sm:flex items-center gap-2.5 text-[11px] font-mono text-slate-500 shrink-0">
        {file.language && <span>{file.language}</span>}
        {!isDirectory && formatSize(file.size) && <span>{formatSize(file.size)}</span>}
      </div>
    </li>
  );
}
