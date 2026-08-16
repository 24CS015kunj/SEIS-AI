import React from 'react';
import { FileCode2, Clock } from 'lucide-react';

export default function AnalysisStats({ filesProcessed, totalFiles, estimatedTimeLabel }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-[12.5px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <FileCode2 size={13} aria-hidden="true" />
        <span className="tabular-nums">{filesProcessed.toLocaleString()}</span> /{' '}
        <span className="tabular-nums">{totalFiles.toLocaleString()}</span> files processed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock size={13} aria-hidden="true" />
        {estimatedTimeLabel}
      </span>
    </div>
  );
}
