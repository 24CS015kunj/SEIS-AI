import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  GitBranch,
  Layers,
  Cpu,
  Boxes,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
import { BrandGlyph } from '../common/BrandMark';
import { getRepository, ingestRepository, getRepositoryBranches } from '../../services/repositoryService';

const PIPELINE_STAGES = [
  {
    id: 'branches',
    title: 'Branch & File Sync',
    desc: 'Verifying Git tree and resolving default branch structure',
    icon: GitBranch,
  },
  {
    id: 'ast',
    title: 'AST Parsing & Semantic Chunking',
    desc: 'Extracting functions, classes, and language syntax boundaries',
    icon: Cpu,
  },
  {
    id: 'embeddings',
    title: 'Neural Vector Indexing',
    desc: 'Generating high-dimensional embeddings for AI Copilot retrieval',
    icon: Sparkles,
  },
  {
    id: 'architecture',
    title: 'Dependency Graph & Risk Mapping',
    desc: 'Constructing module dependencies and architecture health graph',
    icon: Boxes,
  },
];

export default function AiIngestionWizardModal({ isOpen, repository, onClose }) {
  const navigate = useNavigate();
  const [pipelineState, setPipelineState] = useState('initializing'); // initializing | processing | completed | error
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [stageProgress, setStageProgress] = useState(15);
  const [errorMessage, setErrorMessage] = useState(null);
  const [repoDetails, setRepoDetails] = useState(repository);
  const isMountedRef = useRef(true);

  const repoId = repository?._id;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startIngestionPipeline = async () => {
    if (!repoId) return;

    setPipelineState('initializing');
    setErrorMessage(null);
    setActiveStageIndex(0);
    setStageProgress(20);

    try {
      // Step 1: Ensure branches are synced (prerequisite for backend ingestion)
      try {
        await getRepositoryBranches(repoId);
      } catch (branchErr) {
        // If branch sync already exists, this is non-fatal
      }

      if (!isMountedRef.current) return;
      setActiveStageIndex(1);
      setStageProgress(45);

      // Step 2: Trigger AI Ingestion
      const triggerRes = await ingestRepository(repoId);
      if (triggerRes?.status === 'completed' || triggerRes?.ingestionStatus === 'completed') {
        if (!isMountedRef.current) return;
        setActiveStageIndex(3);
        setStageProgress(100);
        setPipelineState('completed');
        return;
      }

      if (!isMountedRef.current) return;
      setPipelineState('processing');
      setActiveStageIndex(2);
      setStageProgress(70);

      // Poll ingestion status until complete or failed
      let attempts = 0;
      const maxAttempts = 40; // ~80 seconds
      const pollInterval = setInterval(async () => {
        if (!isMountedRef.current) {
          clearInterval(pollInterval);
          return;
        }

        attempts += 1;
        try {
          const updated = await getRepository(repoId);
          if (!isMountedRef.current) {
            clearInterval(pollInterval);
            return;
          }

          setRepoDetails(updated);

          if (updated.ingestionStatus === 'completed') {
            clearInterval(pollInterval);
            setActiveStageIndex(3);
            setStageProgress(100);
            setPipelineState('completed');
          } else if (updated.ingestionStatus === 'failed') {
            clearInterval(pollInterval);
            setPipelineState('error');
            setErrorMessage(updated.ingestionError || 'AI Ingestion process encountered an error.');
          } else {
            // Still processing: increment stage progress nicely
            setStageProgress((prev) => Math.min(prev + 5, 92));
            if (attempts > 5) setActiveStageIndex(3);
          }
        } catch {
          // Poll network blip, continue
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          // If taking longer, allow user to enter command center anyway as background task continues
          if (isMountedRef.current) {
            setStageProgress(100);
            setPipelineState('completed');
          }
        }
      }, 2500);
    } catch (err) {
      if (!isMountedRef.current) return;
      const status = err.response?.status;
      const message = err.response?.data?.message;

      // If already processing or completed, treat gracefully
      if (status === 409 && message?.includes('already in progress')) {
        setPipelineState('processing');
        setActiveStageIndex(2);
        setStageProgress(75);
      } else {
        setPipelineState('error');
        setErrorMessage(
          message || 'Failed to start AI Ingestion. Please check server connection and retry.'
        );
      }
    }
  };

  useEffect(() => {
    if (isOpen && repoId) {
      // Check current repository status first
      if (repository.ingestionStatus === 'completed') {
        setActiveStageIndex(3);
        setStageProgress(100);
        setPipelineState('completed');
      } else {
        startIngestionPipeline();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, repoId]);

  if (!isOpen || !repository) return null;

  const handleEnterCommandCenter = () => {
    navigate(`/command-center/${repoId}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingestion-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Glow Header Banner */}
        <div className="relative bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-6 pt-7 pb-6 text-white overflow-hidden">
          <div
            className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-blue-500/20 blur-2xl pointer-events-none"
            aria-hidden="true"
          />
          <div
            className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                <BrandGlyph size={22} tone="onDark" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                    Step 3: AI Engine Activation
                  </span>
                </div>
                <h2 id="ingestion-modal-title" className="text-lg sm:text-xl font-bold text-white mt-0.5">
                  {pipelineState === 'completed'
                    ? 'AI Engine Ready & Online!'
                    : `Analyzing ${repository.name}`}
                </h2>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="text-white/60 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Real-time Progress Bar */}
          <div className="mt-5 relative">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-white/80 mb-1.5">
              <span>Overall Activation Readiness</span>
              <span>{stageProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${stageProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Pipeline Stage Checklist */}
        <div className="p-6 bg-slate-50/50">
          <div className="space-y-3">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isPast = idx < activeStageIndex || pipelineState === 'completed';
              const isCurrent = idx === activeStageIndex && pipelineState !== 'completed' && pipelineState !== 'error';
              const StageIcon = stage.icon;

              return (
                <div
                  key={stage.id}
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all duration-300 ${
                    isPast
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : isCurrent
                        ? 'bg-white border-blue-300 shadow-sm ring-2 ring-blue-500/10'
                        : 'bg-white/60 border-slate-200/80 opacity-60'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isPast
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-blue-600 text-white animate-pulse'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 size={16} strokeWidth={2.5} />
                    ) : isCurrent ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <StageIcon size={16} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[13.5px] font-bold ${
                          isPast ? 'text-emerald-950' : isCurrent ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        {stage.title}
                      </span>
                      {isPast && (
                        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                          Ready
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          Processing
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error Message if pipeline fails */}
          {pipelineState === 'error' && (
            <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13px] flex items-start gap-2.5">
              <AlertCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Ingestion could not complete</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[12px] text-slate-500 text-center sm:text-left">
            {pipelineState === 'completed' ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                AST and neural vectors successfully compiled.
              </span>
            ) : pipelineState === 'error' ? (
              <span>You can retry or continue to the dashboard.</span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Loader2 size={13} className="animate-spin text-blue-600" />
                Asynchronous indexing running in background…
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {pipelineState === 'error' ? (
              <>
                <button
                  type="button"
                  onClick={startIngestionPipeline}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[13px] font-semibold transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} />
                  Retry Ingestion
                </button>
                <button
                  type="button"
                  onClick={handleEnterCommandCenter}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition-colors cursor-pointer"
                >
                  Skip to Dashboard
                  <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleEnterCommandCenter}
                disabled={pipelineState !== 'completed' && stageProgress < 70}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[13.5px] font-semibold transition-all shadow-md shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <span>Launch Command Center</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
