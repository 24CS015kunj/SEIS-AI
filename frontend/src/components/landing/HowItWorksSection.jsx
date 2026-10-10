import React, { useState, useEffect } from 'react';
import {
  Braces,
  GitBranch,
  Database,
  Network,
  LineChart,
  Bot,
  Play,
  Pause,
} from 'lucide-react';
import FadeIn from '../common/FadeIn';
import InteractiveRobot from '../common/InteractiveRobot';

const stages = [
  {
    step: '01',
    label: 'Repository Ingest',
    title: 'OAuth & Manifest Ingestion',
    desc: 'Secure read-only OAuth authentication. Streams repository tarballs into memory, stripping binaries and vendored dependencies.',
    underHood: 'Express backend queries GitHub API for branch schemas, file trees, and commit metadata with strict isolation keys.',
    icon: GitBranch,
    activeBadge: 'connected'
  },
  {
    step: '02',
    label: 'AST Parsing',
    title: 'Abstract Syntax Tree Parsing',
    desc: 'Parses source code into language-specific ASTs using Tree-Sitter grammars across JS, TS, Python, and Go.',
    underHood: 'Extracts cross-file imports, exports, functions, and class definitions to preserve structural boundaries.',
    icon: Braces,
    activeBadge: 'parsed'
  },
  {
    step: '03',
    label: 'Vector Indexing',
    title: 'Semantic Chunks & Vector Store',
    desc: 'Transforms code chunks and headings into high-dimensional embeddings stored in isolated Chroma collections.',
    underHood: 'Content-hash embedding cache prevents re-indexing unmodified files across incremental repository pushes.',
    icon: Database,
    activeBadge: 'indexed'
  },
  {
    step: '04',
    label: 'Dependency Map',
    title: 'Directed Import Graph & Cycle Detection',
    desc: 'Constructs directed dependency graph models between modules, identifying circular loops and high-coupling risks.',
    underHood: "Tarjan's strongly connected components algorithm identifies mutual circular import loops in milliseconds.",
    icon: Network,
    activeBadge: 'mapped'
  },
  {
    step: '05',
    label: 'Evolution Engine',
    title: 'Commit Churn & Hotspot Scoring',
    desc: 'Combines commit change frequency with structural complexity to pinpoint high-risk engineering hotspots.',
    underHood: 'Risk Formula: Hotspot Risk is approximately Churn Frequency x Cyclomatic Complexity. Flags files requiring architectural refactoring.',
    icon: LineChart,
    activeBadge: 'analyzed'
  },
  {
    step: '06',
    label: 'Grounded RAG',
    title: 'Zero-Hallucination Repository Copilot',
    desc: 'Answers complex architectural questions supported by retrievable repository context and line-range citations.',
    underHood: 'Strict grounding: if verifiable code evidence is missing, the AI communicates that rather than inventing answers.',
    icon: Bot,
    activeBadge: 'grounded'
  }
];

export default function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
      if (mediaQuery.matches) setIsAutoPlay(false);
    };

    syncMotionPreference();
    mediaQuery.addEventListener?.('change', syncMotionPreference);
    return () => mediaQuery.removeEventListener?.('change', syncMotionPreference);
  }, []);

  useEffect(() => {
    if (!isAutoPlay) return;
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % stages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isAutoPlay]);

  const current = stages[active];
  const StageIcon = current.icon;

  const handleSelectStage = (idx) => {
    setIsAutoPlay(false);
    setActive(idx);
  };

  return (
    <section id="how-it-works" className="py-16 sm:py-24 border-b border-(--seis-border-subtle) bg-(--seis-canvas)">
      <div className="mx-auto w-full max-w-310 px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <FadeIn direction="up">
          <div className="mx-auto mb-12 max-w-180 text-center">
            <div className="eyebrow">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--seis-cyan) align-middle" />
              INGESTION &amp; INTELLIGENCE PIPELINE
            </div>
            <h2 className="text-[1.8rem] sm:text-[2.55rem] font-extrabold text-(--seis-text-primary) leading-tight m-0">
              From Raw Git Tree to{' '}
              <span className="text-(--seis-cyan)">Grounded Intelligence</span>
            </h2>
            <p className="mx-auto mt-4 max-w-150 text-[17px] leading-relaxed text-(--seis-text-secondary) m-0">
              An automated, multi-stage processing engine that transforms code repositories into searchable
              knowledge graphs, churn forensics, and verifiable citations.
            </p>
          </div>
        </FadeIn>

        {/* Pipeline Stage Bar */}
        <FadeIn direction="up" delay={50}>
          <div className="mb-8 rounded-lg border border-(--seis-border-subtle) bg-(--seis-surface-1) p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-(--seis-border-subtle)">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-(--seis-cyan) animate-pulse" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-(--seis-text-secondary)">
                  Pipeline Execution Stages
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoPlay(!isAutoPlay)}
                disabled={prefersReducedMotion}
                className="btn-tool-secondary h-7 px-2.5 text-[11px] font-mono flex items-center gap-1.5"
                title={prefersReducedMotion ? 'Animation disabled by reduced motion preference' : isAutoPlay ? 'Pause auto walkthrough' : 'Resume auto walkthrough'}
              >
                {isAutoPlay && !prefersReducedMotion ? <Pause size={12} /> : <Play size={12} />}
                <span>{prefersReducedMotion ? 'Reduced Motion' : isAutoPlay ? 'Pause' : 'Play'}</span>
              </button>
            </div>

            {/* Stage Selector Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {stages.map((stg, idx) => {
                const isActive = active === idx;
                const isComplete = idx < active;
                const Icon = stg.icon;
                return (
                  <button
                    key={stg.step}
                    type="button"
                    onClick={() => handleSelectStage(idx)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex flex-col items-center justify-center p-3 rounded-md transition-all cursor-pointer text-center ${
                      isActive
                        ? 'bg-(--seis-highlight) border border-(--seis-cyan)/40 shadow-sm font-semibold'
                        : isComplete
                          ? 'bg-(--seis-cyan-subtle) border border-(--seis-cyan)/20'
                          : 'bg-(--seis-surface-2) hover:bg-(--seis-surface-hover) border border-(--seis-border-subtle)'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center mb-1.5 transition-colors ${
                        isActive
                          ? 'bg-(--seis-cyan) text-(--seis-text-on-accent) font-bold shadow-[0_0_12px_rgba(25,190,213,0.3)]'
                          : isComplete
                            ? 'bg-(--seis-cyan)/15 text-(--seis-cyan) border border-(--seis-cyan)/20'
                            : 'bg-(--seis-surface-1) text-(--seis-text-secondary) border border-(--seis-border-subtle)'
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <span className={`font-mono text-[10px] font-bold ${isActive || isComplete ? 'text-(--seis-cyan)' : 'text-(--seis-text-muted)'}`}>
                      {stg.step}
                    </span>
                    <span className="text-[13px] font-semibold text-(--seis-text-primary) truncate max-w-full">
                      {stg.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="relative mt-4 h-14.5 px-6"
              role="progressbar"
              aria-label="Pipeline walkthrough progress"
              aria-valuemin={1}
              aria-valuemax={stages.length}
              aria-valuenow={active + 1}
            >
              <div className="absolute inset-x-6 top-1/2 h-1 -translate-y-1/2 rounded-full bg-(--seis-surface-inset)" />
              <div className="absolute inset-x-6 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-(--seis-cyan) shadow-[0_0_10px_var(--seis-cyan-glow)] transition-[width] duration-700 ease-out"
                  style={{ width: `${(active / (stages.length - 1)) * 100}%` }}
                />
              </div>
              <div className="absolute inset-x-6 top-1/2 flex -translate-y-1/2 justify-between" aria-hidden="true">
                {stages.map((stage, index) => (
                  <span
                    key={stage.step}
                    className={`h-2.5 w-2.5 rounded-full border-2 transition-all duration-300 ${
                      index <= active
                        ? 'border-(--seis-cyan) bg-(--seis-cyan) shadow-[0_0_8px_var(--seis-cyan-glow)]'
                        : 'border-(--seis-border-strong) bg-(--seis-surface-1)'
                    }`}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-x-6 top-1/2 z-10 -translate-y-1/2"
                aria-hidden="true"
              >
                <div
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${prefersReducedMotion ? 'transition-none!' : ''}`}
                  style={{ left: `${(active / (stages.length - 1)) * 100}%` }}
                >
                  <InteractiveRobot size={42} interactive={false} showChatBubble={false} />
                </div>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Active Stage Details */}
        <FadeIn direction="up" delay={100}>
          <div key={current.step} className="animate-[seis-panel-rise_0.45s_cubic-bezier(0.22,1,0.36,1)_both] rounded-lg border border-(--seis-border-strong) bg-(--seis-surface-1) shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-(--seis-border-subtle) bg-(--seis-surface-2)">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-(--seis-highlight) border border-(--seis-cyan)/30 text-(--seis-cyan) flex items-center justify-center shrink-0">
                  <StageIcon size={20} />
                </div>
                <div>
                  <div className="font-mono text-[10.5px] font-bold text-(--seis-cyan) tracking-wider">
                    STAGE {current.step} OF 06 - {current.activeBadge.toUpperCase()}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-(--seis-text-primary) m-0">
                    {current.title}
                  </h3>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div>
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-(--seis-text-muted) m-0">
                  What happens at this stage
                </h4>
                <p className="mt-2 text-[16px] leading-relaxed text-(--seis-text-primary) m-0">
                  {current.desc}
                </p>
              </div>
              <div className="mt-5 border-t border-(--seis-border-subtle) pt-4">
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-(--seis-text-muted) m-0">
                  Under the hood
                </h4>
                <p className="mt-2 text-[16px] leading-relaxed text-(--seis-text-secondary) m-0">
                  {current.underHood}
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

      </div>
    </section>
  );
}
