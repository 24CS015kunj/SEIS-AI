import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * MOCK ONLY — no network calls, no FastAPI, no real AI. Simulates the shape
 * and lifecycle of a future backend-driven analysis job (analysisId /
 * status / progress / currentStage / stages / filesProcessed / totalFiles /
 * estimatedTime / error) using local timers only.
 *
 * The point of isolating this in one hook: a real implementation later
 * (polling a FastAPI job or subscribing over a socket) can return the exact
 * same `{ analysis, actions }` shape, so `AiRepositoryAnalysisPage.jsx` and
 * every component under `components/analysis/` would not need to change.
 */

export const ANALYSIS_STAGES = [
  { id: 'connect', label: 'Connecting to GitHub', end: 12 },
  { id: 'download', label: 'Downloading Repository', end: 32 },
  { id: 'structure', label: 'Reading Folder Structure', end: 58 },
  { id: 'understand', label: 'Understanding Source Code', end: 84 },
  { id: 'insights', label: 'Generating Architectural Insights', end: 100 },
];

const TICK_MS = 450;
const INITIALIZING_MS = 800;
const RESTART_INITIALIZING_MS = 500;
const ERROR_THRESHOLD = 45;

function parseApproxFileCount(value, fallback = 420) {
  const n = parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** "~2–3 mins" -> 3. Used only as an approximation seed, never shown raw. */
function parseMaxMinutes(value, fallback = 3) {
  const matches = String(value ?? '').match(/\d+/g);
  if (!matches || matches.length === 0) return fallback;
  return Math.max(...matches.map(Number));
}

/** Always an approximate bucket ("~2 minutes remaining") — never fake precision. */
function formatEstimatedTimeRemaining(maxMinutes, progress) {
  if (progress >= 97) return 'Almost done';
  const remaining = Math.max(1, Math.ceil(maxMinutes * (1 - progress / 100)));
  return remaining <= 1 ? '~1 minute remaining' : `~${remaining} minutes remaining`;
}

export function useAnalysisSimulation(repository) {
  const totalFiles = useMemo(() => parseApproxFileCount(repository?.fileCount), [repository?.fileCount]);
  const maxMinutes = useMemo(() => parseMaxMinutes(repository?.estAnalysisTime), [repository?.estAnalysisTime]);

  // `?mockStatus=error` deterministically fails the very first analysis run
  // only, never a random failure — retrying (or restarting after cancel)
  // always succeeds from then on.
  const forceErrorOnce = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mockStatus') === 'error',
    []
  );

  const [status, setStatus] = useState('initializing'); // initializing | analyzing | error | cancelled | success
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [progress, setProgress] = useState(0);
  const hasFailedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // initializing -> analyzing, exactly once per run, cleaned up on every re-entry.
  useEffect(() => {
    if (status !== 'initializing') return undefined;
    const delay = hasFailedRef.current ? RESTART_INITIALIZING_MS : INITIALIZING_MS;
    const timer = window.setTimeout(() => {
      if (mountedRef.current) setStatus('analyzing');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [status]);

  // Exactly one ticking interval, alive only while actively analyzing and not
  // paused behind the cancel-confirmation dialog. The cleanup function is
  // what guarantees no duplicate timers and no progress after cancel/success.
  useEffect(() => {
    if (status !== 'analyzing' || confirmingCancel) return undefined;
    const id = window.setInterval(() => {
      setProgress((p) => Math.min(p + 3 + Math.random() * 6, 100));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [status, confirmingCancel]);

  // Terminal transitions decided from progress, kept out of the setState
  // updater above so they only ever fire once per threshold crossing.
  useEffect(() => {
    if (status !== 'analyzing' || confirmingCancel) return;
    if (forceErrorOnce && !hasFailedRef.current && progress >= ERROR_THRESHOLD) {
      hasFailedRef.current = true;
      setStatus('error');
    } else if (progress >= 100) {
      setStatus('success');
    }
  }, [progress, status, confirmingCancel, forceErrorOnce]);

  const roundedProgress = Math.round(progress);
  const currentStage =
    ANALYSIS_STAGES.find((s) => roundedProgress < s.end) ?? ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1];

  const stages = useMemo(
    () =>
      ANALYSIS_STAGES.map((s) => ({
        ...s,
        status: roundedProgress >= s.end ? 'complete' : s.id === currentStage.id ? 'active' : 'pending',
      })),
    [roundedProgress, currentStage.id]
  );

  const filesProcessed = Math.round((Math.min(roundedProgress, 100) / 100) * totalFiles);
  const estimatedTimeLabel = formatEstimatedTimeRemaining(maxMinutes, roundedProgress);

  /** Used by both "Retry Analysis" (from error) and "Start New Analysis" (from cancelled). */
  const restartAnalysis = () => {
    if (status !== 'error' && status !== 'cancelled') return;
    setProgress(0);
    setConfirmingCancel(false);
    setStatus('initializing');
  };

  const requestCancel = () => {
    if (status !== 'initializing' && status !== 'analyzing') return;
    setConfirmingCancel(true);
  };

  const dismissCancel = () => setConfirmingCancel(false);

  const confirmCancel = () => {
    setConfirmingCancel(false);
    setStatus('cancelled');
  };

  return {
    analysis: {
      analysisId: `mock-${repository?.owner ?? 'seis'}-${repository?.name ?? 'repo'}`,
      repository,
      status,
      confirmingCancel,
      progress: roundedProgress,
      currentStage,
      stages,
      filesProcessed,
      totalFiles,
      estimatedTimeLabel,
      error:
        status === 'error'
          ? {
              message:
                'SEIS was unable to finish analyzing this repository. This can happen due to a network interruption or a temporarily unavailable service.',
              stageLabel: currentStage.label,
            }
          : null,
    },
    actions: { restartAnalysis, requestCancel, dismissCancel, confirmCancel },
  };
}
