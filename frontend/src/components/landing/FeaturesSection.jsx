import React from 'react';
import { GitPullRequest, Layers, BookOpen, History, Activity, Brain } from 'lucide-react';
import FadeIn from '../common/FadeIn';

const features = [
  { icon: GitPullRequest, iconColor: '#0071E3', bg: 'rgba(0, 113, 227, 0.1)', title: 'Source Control', body: 'Understand commits, branches, pull requests, issues, releases, and contributors with complete context.' },
  { icon: Layers, iconColor: '#5856D6', bg: 'rgba(88, 86, 214, 0.1)', title: 'Architecture Mapping', body: 'Explore modules, dependencies, APIs, and hierarchical relationships across your entire codebase.' },
  { icon: BookOpen, iconColor: '#AF52DE', bg: 'rgba(175, 82, 222, 0.1)', title: 'Codebase Understanding', body: 'Build a deep, structured understanding of repositories without reading thousands of lines manually.' },
  { icon: History, iconColor: '#34C759', bg: 'rgba(52, 199, 89, 0.1)', title: 'Software Evolution', body: 'Trace historical churn hotspots, architectural drift, and high-frequency code modifications over time.' },
  { icon: Activity, iconColor: '#FF9500', bg: 'rgba(255, 149, 0, 0.1)', title: 'Engineering Insights', body: 'Surface technical debt, anti-patterns, circular dependencies, and critical areas requiring attention.' },
  { icon: Brain, iconColor: '#FFFFFF', bg: 'linear-gradient(135deg, #0071E3, #AF52DE)', title: 'Intelligent Copilot', body: 'Ask questions in natural language and receive grounded, accurate explanations with file references.' },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn direction="up">
          <div className="section-header-centered mb-16 max-w-[800px] mx-auto text-center">
            <div className="eyebrow mb-3">CAPABILITIES</div>
            <h2 className="headline-lg font-bold tracking-tight text-[#1D1D1F]">
              Everything You Need to <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0071E3] via-[#5856D6] to-[#AF52DE]">
                Master Any Repository.
              </span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <FadeIn key={feat.title} direction="up" delay={i * 70}>
                <div className="apple-card p-7 rounded-[22px] flex flex-col items-start h-full cursor-pointer relative group">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-108"
                    style={{ background: feat.bg }}
                  >
                    <Icon size={22} color={feat.iconColor} />
                  </div>
                  
                  <h3 className="text-[17px] font-semibold text-[#1D1D1F] tracking-tight mb-2">
                    {feat.title}
                  </h3>
                  <p className="text-[14px] text-[#86868B] leading-relaxed m-0">
                    {feat.body}
                  </p>
                </div>
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
