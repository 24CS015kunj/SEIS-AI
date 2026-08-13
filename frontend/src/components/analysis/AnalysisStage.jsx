import React from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * Status is always carried by icon shape + text color + sr-only text — never
 * by color alone (complete uses a check glyph, active uses a spinner glyph,
 * pending uses the stage's own icon at low contrast).
 */
export default function AnalysisStage({ stage }) {
  const { label, status } = stage;
  const Icon = stage.Icon;

  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
          status === 'complete'
            ? 'bg-blue-600 border-blue-600'
            : status === 'active'
              ? 'bg-white border-indigo-500'
              : 'bg-white border-slate-200'
        }`}
      >
        {status === 'complete' ? (
          <Check size={13} className="text-white" strokeWidth={3} />
        ) : status === 'active' ? (
          <Loader2 size={13} className="text-indigo-500 animate-spin motion-reduce:animate-none" />
        ) : (
          <Icon size={11} className="text-slate-300" />
        )}
      </span>
      <span
        className={`text-[14px] transition-colors ${
          status === 'complete'
            ? 'text-blue-700 font-medium'
            : status === 'active'
              ? 'text-slate-900 font-semibold'
              : 'text-slate-400'
        }`}
      >
        {label}
      </span>
      <span className="sr-only">
        {status === 'complete' ? ', completed' : status === 'active' ? ', in progress' : ', pending'}
      </span>
    </li>
  );
}
