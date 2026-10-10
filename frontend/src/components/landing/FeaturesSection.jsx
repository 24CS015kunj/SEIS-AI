import React from 'react';
import { Activity, BookOpen, FileSearch, GitBranch, Layers3, Network } from 'lucide-react';
import FadeIn from '../common/FadeIn';

const features = [
  {
    icon: GitBranch,
    title: 'Commit Forensics & Churn',
    body: 'Analyze commit frequency, author patterns, and changed files across all branches with honest telemetry.',
    number: '01',
  },
  {
    icon: Network,
    title: 'Directed Dependency Maps',
    body: 'Explore internal module imports, calculate coupling ratios, and identify circular loops with AST precision.',
    number: '02',
  },
  {
    icon: BookOpen,
    title: 'Structural Architecture',
    body: 'Build mental models of unfamiliar repositories through directory trees and auto-generated architecture briefs.',
    number: '03',
  },
  {
    icon: Activity,
    title: 'Hotspot Detection Formula',
    body: 'Rank files by Hotspot Risk = Change Frequency x Complexity. Identify files that need refactoring before release.',
    number: '04',
  },
  {
    icon: Layers3,
    title: 'Vector Knowledge Representation',
    body: 'Convert source code, headings, and configs into semantic vector embeddings with content-hash deduplication.',
    number: '05',
  },
  {
    icon: FileSearch,
    title: 'Grounded AI Copilot',
    body: 'Ask natural-language questions and receive grounded explanations with direct, clickable file citations.',
    number: '06',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-16 sm:py-24 border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)]">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="mb-12 text-center max-w-[700px] mx-auto">
            <div className="eyebrow">
              CORE CAPABILITIES
            </div>
            <h2 className="text-[1.8rem] sm:text-[2.55rem] font-extrabold text-[var(--seis-text-primary)] leading-tight m-0">
              Tool-Grade{' '}
              <span className="text-[var(--seis-cyan)]">Engineering</span> Intelligence
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[var(--seis-text-secondary)] m-0">
              Purpose-built capabilities engineered to analyze living software systems rather than isolated text files.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <FadeIn key={feature.title} direction="up" delay={index * 50} className="h-full">
                <article className="group flex h-full min-h-[240px] flex-col justify-between rounded-lg border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] p-6 transition-all duration-300 hover:border-[var(--seis-cyan)]/40 hover:shadow-[0_4px_20px_rgba(25,190,213,0.06)]">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-8 h-8 rounded-md bg-[var(--seis-highlight)] border border-[var(--seis-cyan)]/30 text-[var(--seis-cyan)] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Icon size={16} />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[var(--seis-text-muted)] group-hover:text-[var(--seis-cyan)] transition-colors">
                        {feature.number}
                      </span>
                    </div>

                    <h3 className="text-[17px] font-bold text-[var(--seis-text-primary)] m-0 group-hover:text-[var(--seis-cyan)] transition-colors">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[16px] leading-relaxed text-[var(--seis-text-secondary)] m-0">
                      {feature.body}
                    </p>
                  </div>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
