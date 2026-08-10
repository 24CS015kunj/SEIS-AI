import React, { useState } from 'react';
import { Download, Search, Database, Compass, Lightbulb, Bot, Rocket, Zap } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';
import FadeIn from '../common/FadeIn';

const pipeline = [
  { id: 'github', label: 'GitHub', desc: 'Connect repositories securely', transition: 'Clone Repository', transitionDetails: 'Securely fetches source code via GitHub API and webhooks.', icon: GithubIcon, iconColor: '#475569', bg: '#F1F5F9', textColor: '#0F172A' },
  { id: 'import', label: 'Import', desc: 'Clone and parse code structure', transition: 'AST Parsing', transitionDetails: 'Breaks down raw code into abstract syntax trees for deep analysis.', icon: Download, iconColor: '#475569', bg: '#E2E8F0', textColor: '#0F172A' },
  { id: 'analysis', label: 'Analysis', desc: 'Scan for patterns and logic', transition: 'Vectorize Code', transitionDetails: 'Generates high-dimensional semantic embeddings for every function.', icon: Search, iconColor: '#2563EB', bg: '#EFF6FF', textColor: '#2563EB' },
  { id: 'knowledge', label: 'Knowledge', desc: 'Build AI vector relationships', transition: 'Graph Construction', transitionDetails: 'Maps dependencies, imports, and architectural boundaries into a graph.', icon: Database, iconColor: '#7C3AED', bg: '#F3E8FF', textColor: '#7C3AED' },
  { id: 'architecture', label: 'Architecture', desc: 'Map system dependencies', transition: 'Extract Insights', transitionDetails: 'Identifies technical debt, anti-patterns, and engineering risks.', icon: Compass, iconColor: '#2563EB', bg: '#EFF6FF', textColor: '#2563EB' },
  { id: 'insights', label: 'Insights', desc: 'Extract key engineering insights', transition: 'Initialize Context', transitionDetails: 'Loads insights into the AI assistant for instant, accurate retrieval.', icon: Lightbulb, iconColor: '#475569', bg: '#F1F5F9', textColor: '#0F172A' },
  { id: 'assistant', label: 'Assistant', desc: 'Chat directly with your codebase', transition: 'Answer Queries', transitionDetails: 'Generates context-aware responses to complex engineering questions.', icon: Bot, iconColor: '#FFFFFF', bg: 'linear-gradient(135deg, #2563EB, #7C3AED)', textColor: '#7C3AED' },
  { id: 'productivity', label: 'Productivity', desc: 'Ship features 10x faster', icon: Rocket, iconColor: '#10B981', bg: '#ECFDF5', textColor: '#0F172A' },
];

export default function HowItWorksSection() {
  const [activeId, setActiveId] = useState(null);
  const [activeArrowIdx, setActiveArrowIdx] = useState(null);

  return (
    <section id="how-it-works" className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn direction="up">
          <div className="section-header-centered mb-16">
            <div className="eyebrow">HOW IT WORKS</div>
            <h2 className="headline-lg">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Intelligence</span> Pipeline
            </h2>
            <p className="text-sm text-slate-500 mt-2">Click on any step or arrow below to see what happens under the hood.</p>
          </div>
        </FadeIn>

        <div className="flex items-center justify-center gap-4 flex-wrap pb-12">
          {pipeline.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            
            return (
              <React.Fragment key={item.id}>
                <FadeIn direction="scale" delay={idx * 100}>
                  <div className="relative flex flex-col items-center gap-3.5">
                    <button
                      onClick={() => {
                        setActiveId(isActive ? null : item.id);
                        setActiveArrowIdx(null); // close arrows when opening icon
                      }}
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm cursor-pointer transition-all duration-300 border-2 ${
                        isActive ? 'scale-110 border-indigo-500 shadow-indigo-200' : 'hover:scale-105 border-transparent hover:shadow-md'
                      }`}
                      style={{ background: item.bg }}
                    >
                      <Icon size={24} color={item.iconColor} />
                    </button>
                    <div className="text-[13px] font-bold" style={{ color: item.textColor }}>
                      {item.label}
                    </div>
                    
                    {/* Attractive Tooltip under the icon */}
                    <div 
                      className={`absolute top-[100px] whitespace-nowrap text-[13px] font-medium text-slate-800 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-xl shadow-slate-200/50 transition-all duration-300 z-50 ${
                        isActive ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-3 scale-95 pointer-events-none'
                      }`}
                    >
                      {/* Caret pointing up */}
                      <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-slate-200 rotate-45 rounded-[2px]" />
                      <span className="relative z-10">{item.desc}</span>
                    </div>
                  </div>
                </FadeIn>

                {idx < pipeline.length - 1 && (
                  <FadeIn delay={idx * 100 + 50} direction="scale">
                    <div className="text-slate-400 pb-7 px-2 font-bold text-lg">→</div>
                  </FadeIn>
                )}
              </React.Fragment>
            );
          })}
        </div>

      </div>
    </section>
  );
}
