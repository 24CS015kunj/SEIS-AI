import React from 'react';
import { X, FolderGit2 } from 'lucide-react';
import BrandMark from '../common/BrandMark';

const CANCELABLE_STATUSES = ['initializing', 'analyzing'];

export default function AnalysisHeader({ repository, status, onCancelClick }) {
  const showCancel = CANCELABLE_STATUSES.includes(status);

  return (
    <div className="flex items-start justify-between gap-4 mb-10 sm:mb-12">
      <div className="flex items-center gap-3 min-w-0">
        <BrandMark size={40} />
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-tight">
            SEIS AI Copilot
          </div>
          <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500 mt-0.5 truncate">
            <FolderGit2 size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{repository.owner}/{repository.name}</span>
          </div>
        </div>
      </div>
      {showCancel && (
        <button
          type="button"
          onClick={onCancelClick}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E2E8F0] bg-white text-slate-600 text-[13px] font-semibold cursor-pointer transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
      )}
    </div>
  );
}
