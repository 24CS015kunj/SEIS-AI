import React from 'react';
import { FolderOpen } from 'lucide-react';
import FileRow from './FileRow';

export default function FileList({ files }) {
  if (files.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
        <FolderOpen size={20} className="text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-[13px] text-slate-500 m-0">No files found for this branch.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 max-h-[480px] overflow-y-auto">
      {files.map((file) => (
        // Real File documents key on Mongo `_id`.
        <FileRow key={file._id} file={file} />
      ))}
    </ul>
  );
}
