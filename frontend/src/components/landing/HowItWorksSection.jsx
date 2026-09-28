import React, { useState } from 'react';
import { Download, Search, Database, Compass, Lightbulb, Bot, Rocket, ArrowLeft, ArrowRight, Code } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';
import FadeIn from '../common/FadeIn';

const pipeline = [
  {
    id: 'github',
    step: '01',
    label: 'GitHub',
    title: 'Secure Repository Connection',
    desc: 'Connect public or private repositories seamlessly with read-only OAuth scopes.',
    technical: 'Authenticates securely, registers real-time webhook listeners, and initiates non-destructive cataloging.',
    codeSnippet: 'git.connect({ scope: "read-only", events: ["push", "pull_request"] });',
    icon: GithubIcon,
  },
  {
    id: 'import',
    step: '02',
    label: 'Import',
    title: 'Structure & Tree Extraction',
    desc: 'Parses branch topologies, commit histories, and catalog directory hierarchies into indexed trees.',
    technical: 'Extracts full commit matrices, author distributions, and file modification frequencies.',
    codeSnippet: 'repo.extractHierarchy({ depth: "full", branches: ["main", "staging"] });',
    icon: Download,
  },
  {
    id: 'analysis',
    step: '03',
    label: 'Analysis',
    title: 'AST Parsing & Code Semantics',
    desc: 'Breaks down raw source code into language-specific Abstract Syntax Trees (AST).',
    technical: 'Resolves cross-file symbol references, internal export tables, and module dependencies.',
    codeSnippet: 'ast.parseModule({ extractImports: true, resolveTypes: true });',
    icon: Search,
  },
  {
    id: 'knowledge',
    step: '04',
    label: 'Knowledge',
    title: 'Vector Embeddings & Knowledge Graph',
    desc: 'Transforms code semantics and documentation into high-dimensional vector embeddings.',
    technical: 'Constructs a multi-relational knowledge graph linking functions, dependencies, and commit origins.',
    codeSnippet: 'knowledgeGraph.build({ dimensions: 768, metric: "cosine" });',
    icon: Database,
  },
  {
    id: 'architecture',
    step: '05',
    label: 'Architecture',
    title: 'Dependency & Topology Mapping',
    desc: 'Generates live architecture blueprints showing module couplings and package boundaries.',
    technical: 'Detects circular dependencies, monolithic choke points, and architectural drift.',
    codeSnippet: 'topology.analyze({ detectCycles: true, clusterModules: true });',
    icon: Compass,
  },
  {
    id: 'insights',
    step: '06',
    label: 'Insights',
    title: 'Evolution & Churn Analytics',
    desc: 'Surfaces technical debt, high-frequency churn hotspots, and engineering risk metrics.',
    technical: 'Computes cognitive complexity, churn-to-defect ratios, and file volatility over time.',
    codeSnippet: 'metrics.evaluate({ health: 94, churnWindow: "90d", debtIndex: "A-" });',
    icon: Lightbulb,
  },
  {
    id: 'assistant',
    step: '07',
    label: 'Assistant',
    title: 'Context-Aware AI Copilot',
    desc: 'Answers natural language engineering queries with grounded references to the exact AST files.',
    technical: 'Retrieves relevant AST chunks and topology graphs to produce hallucination-free architectural explanations.',
    codeSnippet: 'copilot.ask("How does data flow from ingestion to search?", { grounded: true });',
    icon: Bot,
  },
  {
    id: 'productivity',
    step: '08',
    label: 'Productivity',
    title: 'Accelerated Engineering Velocity',
    desc: 'Enables teams to onboard in hours instead of weeks and execute large refactors with total confidence.',
    technical: 'Cuts developer onboarding ramp by 70% and prevents architectural regressions across team pull requests.',
    codeSnippet: 'team.accelerate({ onboardingHours: 2.5, confidence: "100%" });',
    icon: Rocket,
  },
];

export default function HowItWorksSection() {
  const [activeIdx, setActiveIdx] = useState(2); // Default to 'Analysis' step
  const activeStep = pipeline[activeIdx] || pipeline[0];
  const ActiveIcon = activeStep.icon;

  const handlePrev = () => {
    setActiveIdx((prev) => (prev > 0 ? prev - 1 : pipeline.length - 1));
  };

  const handleNext = () => {
    setActiveIdx((prev) => (prev < pipeline.length - 1 ? prev + 1 : 0));
  };

  return (
    <section id="how-it-works" className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn direction="up">
          <div className="section-header-centered mb-14 text-center max-w-[700px] mx-auto">
            <div className="eyebrow mb-2.5">HOW IT WORKS</div>
            <h2 className="headline-lg font-bold tracking-tight text-slate-900 mb-4">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Intelligence</span> Pipeline
            </h2>
            <p className="text-[15px] text-slate-500 leading-relaxed max-w-[560px] mx-auto m-0">
              An automated, multi-stage processing pipeline that turns raw code into actionable engineering intelligence.
            </p>
          </div>
        </FadeIn>

        {/* Pipeline Stepper Bar */}
        <div className="relative max-w-[980px] mx-auto mb-10">
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap sm:flex-nowrap justify-center">
            {pipeline.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeIdx === idx;
              
              return (
                <div key={item.id} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    aria-label={`Step ${item.step}: ${item.label}`}
                    className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/25 ring-4 ring-blue-100 scale-105'
                        : 'bg-white text-slate-600 border-slate-200/90 hover:border-blue-300 hover:text-blue-600 hover:shadow-xs hover:-translate-y-0.5'
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2 : 1.8} />
                    <span className={`text-[10px] font-mono mt-1 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                      {item.step}
                    </span>
                  </button>
                  <span
                    className={`text-[12px] font-medium transition-colors ${
                      isActive ? 'text-blue-600 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Stage Inspector Card */}
        <FadeIn key={activeStep.id} direction="up" delay={50}>
          <div className="max-w-[920px] mx-auto bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <ActiveIcon size={22} strokeWidth={2} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      STAGE {activeStep.step} OF 08
                    </span>
                    <span className="text-[11.5px] font-semibold text-slate-400">·</span>
                    <span className="text-[12px] text-slate-500 font-medium">Pipeline Stage</span>
                  </div>
                  <h3 className="text-[18px] sm:text-[20px] font-bold text-slate-900 mt-1 m-0">
                    {activeStep.title}
                  </h3>
                </div>
              </div>

              {/* Prev / Next controls */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Previous Step"
                >
                  <ArrowLeft size={13} />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-8 px-3 rounded-lg border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  title="Next Step"
                >
                  <span>Next</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {/* Stage Body */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 space-y-4">
                <div>
                  <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    What happens here
                  </h4>
                  <p className="text-[14px] text-slate-700 leading-relaxed m-0 font-medium">
                    {activeStep.desc}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Under the hood
                  </h4>
                  <p className="text-[13px] text-slate-500 leading-relaxed m-0">
                    {activeStep.technical}
                  </p>
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="md:col-span-5 bg-slate-900 rounded-xl p-4 text-slate-100 border border-slate-800 shadow-inner">
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Code size={12} className="text-blue-400" />
                    <span className="font-mono">pipeline_runner.ts</span>
                  </div>
                  <span className="font-mono text-emerald-400">active</span>
                </div>
                <pre className="text-[12px] font-mono text-blue-200 overflow-x-auto whitespace-pre-wrap leading-relaxed m-0">
                  <code>{activeStep.codeSnippet}</code>
                </pre>
              </div>
            </div>
          </div>
        </FadeIn>

      </div>
    </section>
  );
}
