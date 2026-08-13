import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, FolderTree, Code2, Sparkles } from 'lucide-react';
import GithubIcon from '../components/common/GithubIcon';
import FadeIn from '../components/common/FadeIn';
import { useAnalysisSimulation } from '../services/analysisMockService';
import AnalysisHeader from '../components/analysis/AnalysisHeader';
import AnalysisInitializing from '../components/analysis/AnalysisInitializing';
import AnalysisProgress from '../components/analysis/AnalysisProgress';
import AnalysisStageList from '../components/analysis/AnalysisStageList';
import AnalysisStats from '../components/analysis/AnalysisStats';
import AnalysisError from '../components/analysis/AnalysisError';
import AnalysisCancelled from '../components/analysis/AnalysisCancelled';
import AnalysisSuccess from '../components/analysis/AnalysisSuccess';
import AnalysisCancelDialog from '../components/analysis/AnalysisCancelDialog';

/**
 * This lucide-react version ships no brand/logo icons (confirmed — no
 * `Github` export exists), which is exactly why the app already has its own
 * `GithubIcon` component. This adapter lets it drop into the same
 * `<Icon size={n} className="..." />` call shape every other stage icon uses.
 */
function GithubStageIcon({ size = 16, className = '' }) {
  return <GithubIcon className={className} style={{ width: size, height: size }} />;
}

const STAGE_ICONS = {
  connect: GithubStageIcon,
  download: Download,
  structure: FolderTree,
  understand: Code2,
  insights: Sparkles,
};

/**
 * MOCK ONLY — used when this page is opened directly (no router state from
 * Import Repository, e.g. a hard refresh or a pasted URL). No auth guard
 * exists yet in this frontend-only phase, so the page must still render.
 */
const DEFAULT_REPO = {
  name: 'seis-ai-copilot',
  owner: 'seis-ai',
  language: 'JavaScript',
  fileCount: '~420',
  estAnalysisTime: '~2–3 mins',
};

export default function AiRepositoryAnalysisPage() {
  const location = useLocation();
  const repository = location.state?.repo ?? DEFAULT_REPO;

  const { analysis, actions } = useAnalysisSimulation(repository);
  const [announcement, setAnnouncement] = useState('');

  const stagesWithIcons = analysis.stages.map((s) => ({ ...s, Icon: STAGE_ICONS[s.id] }));

  // Announce meaningful transitions only (status changes, stage changes) —
  // never every percentage tick, so screen readers aren't flooded.
  useEffect(() => {
    if (analysis.status === 'initializing') setAnnouncement('Preparing repository analysis.');
    else if (analysis.status === 'analyzing') setAnnouncement(`${analysis.currentStage.label}.`);
    else if (analysis.status === 'error') setAnnouncement(`Analysis failed. ${analysis.error.message}`);
    else if (analysis.status === 'cancelled') setAnnouncement('Analysis cancelled.');
    else if (analysis.status === 'success') setAnnouncement('Analysis complete.');
  }, [analysis.status, analysis.currentStage.id]);

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />

      <div className="relative flex flex-col items-center min-h-screen px-4 sm:px-6 py-12 sm:py-16">
        <div className="w-full max-w-[672px]">
          <AnalysisHeader repository={repository} status={analysis.status} onCancelClick={actions.requestCancel} />

          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

          {analysis.status === 'initializing' && <AnalysisInitializing repository={repository} />}

          {analysis.status === 'analyzing' && (
            <>
              <FadeIn direction="scale">
                <h1 className="sr-only">Analyzing {repository.owner}/{repository.name}</h1>
              </FadeIn>
              <FadeIn>
                <div className="text-center mb-10">
                  <h2 className="headline-lg mb-4 !text-3xl sm:!text-4xl inline-flex items-baseline gap-1">
                    Analyzing Repository
                    <ThinkingDots />
                  </h2>
                  <p className="body-base max-w-[480px] mx-auto">
                    Please wait while SEIS AI Copilot understands your software project. This
                    involves deep structural mapping and AI inference.
                  </p>
                </div>
              </FadeIn>
              <FadeIn delay={100}>
                <AnalysisProgress stages={stagesWithIcons} currentStage={analysis.currentStage} progress={analysis.progress} />
                <AnalysisStageList stages={stagesWithIcons} />
              </FadeIn>
              <FadeIn delay={150}>
                <AnalysisStats
                  filesProcessed={analysis.filesProcessed}
                  totalFiles={analysis.totalFiles}
                  estimatedTimeLabel={analysis.estimatedTimeLabel}
                />
              </FadeIn>
            </>
          )}

          {analysis.status === 'error' && <AnalysisError error={analysis.error} onRetry={actions.restartAnalysis} />}

          {analysis.status === 'cancelled' && (
            <AnalysisCancelled repository={repository} onRestart={actions.restartAnalysis} />
          )}

          {analysis.status === 'success' && (
            <AnalysisSuccess
              repository={repository}
              filesProcessed={analysis.filesProcessed}
              totalFiles={analysis.totalFiles}
              stageCount={analysis.stages.length}
            />
          )}
        </div>
      </div>

      {analysis.confirmingCancel && (
        <AnalysisCancelDialog onContinue={actions.dismissCancel} onStop={actions.confirmCancel} />
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 pb-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce motion-reduce:animate-none"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
