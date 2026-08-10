import React from 'react';
import { Rocket, PlayCircle, Lock, LayoutGrid, FolderGit2, GitPullRequest, Activity, TrendingUp, Bot, Network, ChevronDown } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function HeroSection({ onOpenAuth }) {
  return (
    <section id="hero" className="relative bg-transparent w-full flex flex-col pt-32 pb-24">
      <div className="relative z-10 max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn delay={0}>
          {/* Top Text Content */}
          <div className="section-header-centered max-w-[840px] mx-auto mb-20 p-4">
            
            {/* Headline */}
            <h1 className="headline-xl mb-6">
              Understand Every Software Project{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                with AI Intelligence
              </span>
            </h1>

            {/* Supporting text */}
            <p className="body-lg mb-14 max-w-[700px] mx-auto text-slate-500">
              Transform complex codebases into clear insights. SEIS AI Copilot reads your
              repositories, visualizes architecture, and acts as your ultimate engineering
              assistant.
            </p>

            {/* CTA Row */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button onClick={() => onOpenAuth('github')} className="btn-primary shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 transition-transform">
                Start Free Trial
                <Rocket className="w-5 h-5" />
              </button>

              <button className="btn-secondary hover:-translate-y-0.5 transition-transform">
                <PlayCircle className="w-5 h-5" />
                Watch Demo
              </button>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          {/* Realistic Product Preview */}
          <div className="max-w-[1040px] mx-auto relative hover:shadow-2xl transition-shadow duration-500 rounded-xl group">
            <div className="app-window relative z-10 bg-[#FAFAFA] backdrop-blur-md border border-[#E2E8F0]">
              
              {/* App Titlebar */}
              <div className="app-titlebar bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between">
                <div className="flex gap-1.5 w-[100px]">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <div className="flex justify-center flex-1">
                  <div className="flex items-center gap-2 bg-slate-100/80 px-24 py-1.5 rounded-md">
                    <Lock size={12} className="text-slate-500" />
                    <span className="text-[13px] text-slate-500 font-medium">
                      app.seis.ai/dashboard
                    </span>
                  </div>
                </div>
                <div className="w-[100px]" /> {/* Spacer for centering */}
              </div>

              {/* App Body */}
              <div className="flex bg-[#F8FAFC]">
                
                {/* Sidebar */}
                <div className="hidden md:flex flex-col w-[240px] border-r border-[#E2E8F0] p-4 bg-[#F8FAFC] shrink-0 min-h-[600px]">
                  {/* Account Selector */}
                  <div className="flex items-center justify-between px-3 py-2 bg-[#F1F5F9] rounded-md border border-[#E2E8F0] mb-6 cursor-pointer">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <div className="w-5 h-5 bg-blue-100 rounded text-blue-600 flex items-center justify-center">
                        <Network size={12} />
                      </div>
                      Acme Corp
                    </div>
                    <ChevronDown size={14} className="text-slate-500" />
                  </div>

                  {/* Navigation */}
                  <div className="flex flex-col gap-1">
                    {[
                      { icon: LayoutGrid, label: 'Overview', active: true },
                      { icon: FolderGit2, label: 'Repositories', active: false },
                      { icon: Network, label: 'Architecture', active: false },
                      { icon: Activity, label: 'Analytics', active: false },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                          item.active 
                            ? 'text-blue-700 bg-blue-100/50' 
                            : 'text-slate-600 hover:bg-slate-100 cursor-pointer'
                        }`}
                      >
                        <item.icon size={16} className={item.active ? 'text-blue-600' : 'text-slate-400'} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6 relative">
                  
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col items-center justify-center">
                      <div className="text-[12px] font-semibold text-slate-500 mb-1">Code Health</div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-slate-900">94%</span>
                        <TrendingUp size={16} className="text-emerald-500" />
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col items-center justify-center">
                      <div className="text-[12px] font-semibold text-slate-500 mb-1">Active PRs</div>
                      <div className="text-2xl font-bold text-slate-900">12</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col items-center justify-center">
                      <div className="text-[12px] font-semibold text-slate-500 mb-1">Tech Debt Score</div>
                      <div className="text-2xl font-bold text-slate-900">A-</div>
                    </div>
                  </div>

                  {/* Architecture Visualization Area */}
                  <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden h-[420px] flex flex-col">
                    <div className="p-4 border-b border-[#E2E8F0]">
                      <h3 className="text-sm font-bold text-slate-900">System Architecture (Auto-generated)</h3>
                    </div>
                    {/* Mocked Graph Area */}
                    <div className="flex-1 relative bg-slate-50/50 overflow-hidden">
                      <div className="absolute inset-0" style={{
                        backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                        opacity: 0.5
                      }} />
                      {/* Random Mock Nodes */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px]">
                        {/* Connecting lines mocked via SVG */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-300 stroke-[1.5px] fill-none">
                          <path d="M 200 150 L 100 80 M 200 150 L 300 100 M 200 150 L 150 250 M 200 150 L 280 220" />
                          <path d="M 100 80 L 50 120 M 300 100 L 350 60" />
                        </svg>
                        {/* Nodes */}
                        <div className="absolute top-[150px] left-[200px] w-12 h-12 bg-blue-100 rounded-full border-2 border-blue-500 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-md">
                          <Network size={20} className="text-blue-600" />
                        </div>
                        <div className="absolute top-[80px] left-[100px] w-8 h-8 bg-purple-100 rounded-full border-2 border-purple-500 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-sm">
                          <Activity size={14} className="text-purple-600" />
                        </div>
                        <div className="absolute top-[100px] left-[300px] w-8 h-8 bg-emerald-100 rounded-full border-2 border-emerald-500 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-sm">
                          <FolderGit2 size={14} className="text-emerald-600" />
                        </div>
                        <div className="absolute top-[250px] left-[150px] w-8 h-8 bg-amber-100 rounded-full border-2 border-amber-500 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-sm">
                          <LayoutGrid size={14} className="text-amber-600" />
                        </div>
                        <div className="absolute top-[220px] left-[280px] w-8 h-8 bg-rose-100 rounded-full border-2 border-rose-500 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-sm">
                          <GitPullRequest size={14} className="text-rose-600" />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Floating AI Widget Overlay */}
                <div className="absolute bottom-6 right-[-24px] w-[340px] bg-[#A78BFA] rounded-xl shadow-2xl p-5 border border-purple-400/50 backdrop-blur-md z-20 transition-transform hover:-translate-y-1">
                  <div className="flex gap-3 mb-3 items-center">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <Bot size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white leading-tight">AI Assistant</div>
                      <div className="text-[10px] text-purple-100/80 font-mono tracking-wide uppercase">Analyzing user-auth-service</div>
                    </div>
                  </div>
                  <div className="text-[13px] leading-relaxed text-white font-medium bg-black/10 rounded-lg p-3">
                    "The recent PR introduced a potential memory leak in the token validation loop. I suggest implementing a cleanup function."
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
