import React from 'react';
import AnalysisStage from './AnalysisStage';

/**
 * Already a single-column vertical list at every breakpoint (not a
 * horizontal stepper), so it needs no separate mobile layout — it reads the
 * same way as a step timeline from 375px up to 1440px.
 */
export default function AnalysisStageList({ stages }) {
  return (
    <ol className="flex flex-col gap-4 mt-7">
      {stages.map((stage) => (
        <AnalysisStage key={stage.id} stage={stage} />
      ))}
    </ol>
  );
}
