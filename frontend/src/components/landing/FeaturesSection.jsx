import React from 'react';
import { GitPullRequest, Layers, BookOpen, History, Activity, Brain } from 'lucide-react';
import FadeIn from '../common/FadeIn';

const features = [
  { icon: GitPullRequest, iconColor: '#475569', bg: '#F1F5F9', title: 'SOURCE CONTROL', body: 'Understand commits, branches, pull requests, issues, releases and contributors.' },
  { icon: Layers, iconColor: '#2563EB', bg: '#EFF6FF', title: 'ARCHITECTURE', body: 'Explore modules, dependencies, APIs and relationships across the system.' },
  { icon: BookOpen, iconColor: '#7C3AED', bg: '#F3E8FF', title: 'PROJECT UNDERSTANDING', body: 'Build a structured understanding of the repository and its components.' },
  { icon: History, iconColor: '#10B981', bg: '#ECFDF5', title: 'SOFTWARE EVOLUTION', body: 'Understand how the project has changed over time.' },
  { icon: Activity, iconColor: '#2563EB', bg: '#EFF6FF', title: 'ENGINEERING INSIGHTS', body: 'Surface important patterns, risks and areas requiring attention.' },
  { icon: Brain, iconColor: '#FFFFFF', bg: 'linear-gradient(135deg, #2563EB, #7C3AED)', title: 'INTELLIGENT ASSISTANCE', body: 'Get contextual explanations and answers about the project.' },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn direction="up">
          <div className="section-header-centered mb-16 max-w-[800px] mx-auto text-center">
            <div className="eyebrow mb-3">PLATFORM CAPABILITIES</div>
            <h2 className="headline-lg">
              Everything You Need to <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Understand a Software Project.</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <FadeIn key={feat.title} direction="up" delay={i * 100}>
                <div className="group bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 hover:-translate-y-1 flex flex-col items-start h-full cursor-pointer relative overflow-hidden">
                  {/* Subtle top gradient glow on hover */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shadow-sm mb-6 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: feat.bg }}
                  >
                    <Icon size={24} color={feat.iconColor} />
                  </div>
                  <h3 className="text-[14px] font-bold text-slate-900 tracking-wider uppercase mb-3">
                    {feat.title}
                  </h3>
                  <p className="text-[15px] text-slate-500 leading-relaxed m-0">
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
