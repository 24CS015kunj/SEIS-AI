import React from 'react';
import { BrandGlyph } from '../common/BrandMark';

/**
 * Hero visualization + numeric progress bar. The orbiting node graph is a
 * supplementary, decorative view of stage progress — the stage checklist
 * (AnalysisStageList) and this bar are the actual source of truth, so the
 * graph never needs to work standalone at any viewport width.
 */
export default function AnalysisProgress({ stages, currentStage, progress }) {
  return (
    <>
      <HeroGraph stages={stages} currentStageId={currentStage.id} />

      <div
        className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-6 sm:p-[33px]"
      >
        <div className="flex items-center justify-between mb-2.5 gap-3">
          <span className="text-[13px] font-semibold text-slate-600 truncate">{currentStage.label}…</span>
          <span className="text-[13px] font-bold text-slate-900 tabular-nums shrink-0">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${progress}% complete, ${currentStage.label}`}
          aria-label="Repository analysis progress"
          className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

function HeroGraph({ stages, currentStageId }) {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  const radius = 108;
  const center = 130;

  return (
    <div className="relative mx-auto mb-10" style={{ width: 260, height: 260 }} aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-200/50 to-indigo-200/50 blur-2xl animate-pulse motion-reduce:animate-none" />

      <div
        className="absolute rounded-2xl bg-white border border-[#E2E8F0] shadow-lg flex items-center justify-center"
        style={{ width: 56, height: 56, left: center - 28, top: center - 28 }}
      >
        <BrandGlyph size={26} tone="onLight" />
      </div>

      {stages.map((stage, i) => {
        const angle = (i / stages.length) * 2 * Math.PI - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const Icon = stage.Icon;
        const done = i < currentIndex;
        const active = i === currentIndex;

        return (
          <React.Fragment key={stage.id}>
            <svg className="absolute inset-0 pointer-events-none" width={260} height={260}>
              <line
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke={done || active ? '#93C5FD' : '#E2E8F0'}
                strokeWidth={1.5}
                strokeDasharray={active ? '4 3' : undefined}
              />
            </svg>
            <div
              className={`absolute rounded-full flex items-center justify-center border-2 transition-all duration-500 motion-reduce:transition-none ${
                done
                  ? 'bg-blue-600 border-blue-600 scale-100'
                  : active
                    ? 'bg-white border-indigo-500 scale-110 shadow-md'
                    : 'bg-white border-slate-200 scale-90 opacity-60'
              }`}
              style={{ width: 40, height: 40, left: x - 20, top: y - 20 }}
            >
              <Icon size={16} className={done ? 'text-white' : active ? 'text-indigo-500' : 'text-slate-300'} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
