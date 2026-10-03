import React from 'react';
import { Rocket, PlayCircle, Lock, LayoutGrid, FolderGit2, GitPullRequest, Activity, TrendingUp, Bot, Network, ChevronDown, Sparkles, Terminal, CheckCircle2 } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function HeroSection({ onOpenAuth }) {
  return (
    <section id="hero" className="relative bg-transparent w-full flex flex-col pt-16 pb-12">
      <div className="relative z-10 max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn delay={0}>
          {/* Top Text Content */}
          <div className="section-header-centered max-w-[860px] mx-auto mb-10 p-2">
            
            {/* Apple Eyebrow Pill */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 text-[#0071E3] text-[13px] font-medium mb-5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#0071E3] animate-pulse" />
              <span>Intelligence for Every Codebase</span>
            </div>

            {/* Headline */}
            <h1 className="headline-xl mb-4 font-bold tracking-tight text-[#1D1D1F]">
              Understand Any Architecture.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0071E3] via-[#5856D6] to-[#AF52DE]">
                Effortlessly.
              </span>
            </h1>

            {/* Supporting text */}
            <p className="body-lg mb-8 max-w-[660px] mx-auto text-[#86868B]">
              Turn complex software projects into crystal-clear architectures. SEIS AI Copilot parses ASTs,
              maps dependencies, and empowers engineering teams with instant clarity.
            </p>

            {/* CTA Row */}
            <div className="flex flex-wrap items-center justify-center gap-3.5 mb-6">
              <button 
                onClick={() => onOpenAuth('github')} 
                className="btn-apple-primary text-[15px] h-12 px-7 cursor-pointer"
              >
                <span>Connect GitHub Repository</span>
                <Rocket className="w-4 h-4" />
              </button>

              <button className="btn-apple-secondary text-[15px] h-12 px-7 cursor-pointer">
                <PlayCircle className="w-4 h-4 text-[#86868B]" />
                <span>Watch Interactive Demo</span>
              </button>
            </div>

            {/* Reassurance chips */}
            <div className="flex flex-wrap items-center justify-center gap-5 text-[13px] text-[#86868B]">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-[#34C759]" /> Zero configuration required
              </span>
              <span className="text-black/20">·</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-[#34C759]" /> Read-only OAuth scope
              </span>
              <span className="text-black/20">·</span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-[#34C759]" /> Instant AST indexing
              </span>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={150}>          {/* Apple macOS Workstation Preview */}
          <div className="max-w-[1060px] mx-auto relative group">
            <div className="app-window relative z-10 bg-white border border-black/[0.08] shadow-[0_24px_70px_-15px_rgba(0,0,0,0.12)] rounded-[22px] overflow-hidden">
              
              {/* macOS Titlebar */}
              <div className="app-titlebar bg-white/80 backdrop-blur-2xl border-b border-black/[0.06] px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-black/10" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-black/10" />
                    <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-black/10" />
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 ml-4 px-3 py-1 bg-black/[0.04] rounded-full text-[12px] text-[#1D1D1F] font-medium">
                    <Terminal size={12} className="text-[#0071E3]" />
                    <span>seis-core</span>
                    <span className="text-black/20">/</span>
                    <span className="font-semibold text-[#1D1D1F]">architecture.map</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-black/[0.04] px-3.5 py-1 rounded-full text-[12px] text-[#86868B] font-medium">
                    <Lock size={11} className="text-[#34C759]" />
                    <span>app.seis.ai/command-center</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[12px] text-[#86868B]">
                  <span className="hidden md:inline-flex items-center gap-1.5 text-[#34C759] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                    AST Synced
                  </span>
                </div>
              </div>

              {/* App Body */}
              <div className="flex bg-[#F5F5F7]">
                
                {/* macOS Translucent Sidebar */}
                <div className="hidden md:flex flex-col w-[230px] border-r border-black/[0.06] p-3.5 bg-[#FBFBFD]/80 backdrop-blur-2xl shrink-0 min-h-[560px]">
                  {/* Account / Workspace Selector */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-black/[0.06] mb-4 cursor-pointer hover:border-black/[0.1] transition-colors shadow-xs">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[#1D1D1F] truncate">
                      <div className="w-5 h-5 bg-[#0071E3]/10 rounded-md text-[#0071E3] flex items-center justify-center shrink-0">
                        <Network size={11} />
                      </div>
                      <span className="truncate">facebook / react</span>
                    </div>
                    <ChevronDown size={13} className="text-[#86868B] shrink-0" />
                  </div>

                  {/* Navigation */}
                  <div className="flex flex-col gap-1">
                    {[
                      { icon: LayoutGrid, label: 'Command Center', active: true },
                      { icon: Network, label: 'Architecture Graph', active: false },
                      { icon: FolderGit2, label: 'Source Modules', active: false },
                      { icon: Activity, label: 'Software Evolution', active: false },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                          item.active 
                            ? 'text-[#0071E3] bg-[#0071E3]/12 font-semibold' 
                            : 'text-[#86868B] hover:bg-black/[0.04] hover:text-[#1D1D1F] cursor-pointer'
                        }`}
                      >
                        <item.icon size={15} className={item.active ? 'text-[#0071E3]' : 'text-[#86868B]'} />
                        <span className="truncate">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Git metadata bottom snippet */}
                  <div className="mt-auto pt-3 border-t border-black/[0.06] text-[12px] text-[#86868B] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#86868B]">Branch:</span>
                      <span className="font-medium text-[#1D1D1F]">main</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868B]">Commit:</span>
                      <span className="text-[#0071E3] font-mono text-[11px]">e8f49b2</span>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-5 sm:p-6 relative">
                  
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-3 gap-3.5 mb-5">
                    <div className="apple-card p-4 flex flex-col justify-between">
                      <div className="text-[12px] font-medium text-[#86868B] mb-1">Architecture Health</div>
                      <div className="text-[22px] font-bold text-[#1D1D1F] tracking-tight">98.4%</div>
                      <div className="text-[11px] text-[#34C759] font-medium mt-1">Optimal structural index</div>
                    </div>
                    <div className="apple-card p-4 flex flex-col justify-between">
                      <div className="text-[12px] font-medium text-[#86868B] mb-1">Parsed Modules</div>
                      <div className="text-[22px] font-bold text-[#1D1D1F] tracking-tight">142</div>
                      <div className="text-[11px] text-[#86868B] mt-1">Across 18 namespaces</div>
                    </div>
                    <div className="apple-card p-4 flex flex-col justify-between">
                      <div className="text-[12px] font-medium text-[#86868B] mb-1">Coupling Index</div>
                      <div className="text-[22px] font-bold text-[#1D1D1F] tracking-tight">0.14</div>
                      <div className="text-[11px] text-[#34C759] font-medium mt-1">Low risk ratio</div>
                    </div>
                  </div>

                  {/* Architecture Visualization Area */}
                  <div className="apple-card overflow-hidden h-[380px] flex flex-col relative">
                    <div className="px-4 py-2.5 border-b border-black/[0.06] bg-[#FBFBFD] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#0071E3]" />
                        <h3 className="text-[13px] font-semibold text-[#1D1D1F]">Module Dependency Graph (AST Parsed)</h3>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-[#86868B]">
                        <span className="px-2.5 py-0.5 bg-black/[0.04] rounded-full text-[#1D1D1F] font-medium">TypeScript / ESM</span>
                      </div>
                    </div>

                    {/* Graph Area */}
                    <div className="flex-1 relative bg-white overflow-hidden">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[280px]">
                        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-black/15 stroke-[1.5px] fill-none">
                          <path d="M 210 140 L 90 70 M 210 140 L 320 90 M 210 140 L 140 230 M 210 140 L 300 210" />
                          <path d="M 90 70 L 40 110 M 320 90 L 370 50" />
                        </svg>
                        {/* Core Node */}
                        <div className="absolute top-[140px] left-[210px] w-12 h-12 bg-white rounded-2xl border-2 border-[#0071E3] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-md">
                          <Network size={20} className="text-[#0071E3]" />
                        </div>
                        {/* Leaf Nodes */}
                        <div className="absolute top-[70px] left-[90px] px-3 py-1.5 bg-white rounded-full border border-black/[0.08] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 shadow-xs text-[12px] font-medium text-[#1D1D1F]">
                          <Activity size={12} className="text-[#AF52DE]" />
                          <span>auth/jwt</span>
                        </div>
                        <div className="absolute top-[90px] left-[320px] px-3 py-1.5 bg-white rounded-full border border-black/[0.08] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 shadow-xs text-[12px] font-medium text-[#1D1D1F]">
                          <FolderGit2 size={12} className="text-[#34C759]" />
                          <span>api/router</span>
                        </div>
                        <div className="absolute top-[230px] left-[140px] px-3 py-1.5 bg-white rounded-full border border-black/[0.08] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 shadow-xs text-[12px] font-medium text-[#1D1D1F]">
                          <LayoutGrid size={12} className="text-[#FF9500]" />
                          <span>db/client</span>
                        </div>
                        <div className="absolute top-[210px] left-[300px] px-3 py-1.5 bg-white rounded-full border border-black/[0.08] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 shadow-xs text-[12px] font-medium text-[#1D1D1F]">
                          <GitPullRequest size={12} className="text-[#FF3B30]" />
                          <span>worker/queue</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Authentic Apple Liquid Glass Floating AI Inspector Popover */}
                <div className="absolute bottom-5 right-[-14px] w-[370px] liquid-glass rounded-[22px] p-5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.14)] z-20 transition-transform duration-200 hover:-translate-y-1">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/[0.06]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                        <Sparkles size={13} />
                      </div>
                      <span className="text-[13px] font-semibold text-[#1D1D1F]">AI Architecture Insight</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#34C759] bg-[#34C759]/10 px-2 py-0.5 rounded-full">
                      LIVE
                    </span>
                  </div>

                  <div className="text-[11.5px] font-mono text-[#86868B] mb-2 flex items-center gap-1.5">
                    <Terminal size={11} className="text-[#0071E3]" />
                    <span className="text-[#1D1D1F]">src/services/auth.service.ts:42</span>
                  </div>

                  <div className="text-[13px] leading-relaxed text-[#1D1D1F] bg-white/70 rounded-xl p-3.5 border border-black/[0.05] shadow-xs mb-3.5">
                    <span className="text-[#0071E3] font-medium">Observation: </span>
                    Circular dependency detected between <code className="text-[#FF9500] font-mono text-[12px] bg-black/[0.04] px-1 py-0.5 rounded">TokenValidator</code> and <code className="text-[#FF9500] font-mono text-[12px] bg-black/[0.04] px-1 py-0.5 rounded">UserSession</code>. Refactoring to an interface eliminates tight coupling.
                  </div>

                  <div className="flex items-center justify-between text-[12px] text-[#86868B]">
                    <span className="flex items-center gap-1">Press <kbd className="text-[#1D1D1F] bg-black/[0.06] rounded-md px-1.5 py-0.5 text-[11px] font-medium">⌘K</kbd> to inspect</span>
                    <span className="text-[#0071E3] hover:text-[#0077ED] cursor-pointer font-medium">View refactor plan →</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </FadeIn>

      </div>
    </section>
  );
}
