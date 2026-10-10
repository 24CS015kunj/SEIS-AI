import React from 'react';
import { Blocks, Compass, Route, TimerReset } from 'lucide-react';
import FadeIn from '../common/FadeIn';

const problems = [
  {
    icon: Blocks,
    title: 'Complex Multi-Service Topology',
    body: 'Repositories and services grow into impenetrable black boxes over years of rapid feature delivery.',
  },
  {
    icon: Compass,
    title: 'Scattered Domain Knowledge',
    body: "Architecture decisions, implicit dependencies, and core constraints live only inside senior engineers' heads.",
  },
  {
    icon: Route,
    title: 'Manual Forensic Exploration',
    body: 'Engineers spend over 40% of sprint time stepping through debugger call stacks, git blame, and text grep.',
  },
  {
    icon: TimerReset,
    title: 'Unpredictable Code Churn',
    body: 'Frequent edits in high-complexity modules create hidden engineering hotspots that slip past standard code reviews.',
  },
];

export default function ProblemSection() {
  return (
    <section
      id="problem"
      className="py-16 sm:py-24 border-y border-(--seis-border-subtle) bg-(--seis-surface-2)"
    >
      <div className="mx-auto grid w-full max-w-310 items-center gap-8 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.1fr] lg:gap-10 lg:px-8">
        <FadeIn direction="up">
          <div className="max-w-140">
            <div className="eyebrow">THE STRUCTURAL CHALLENGE</div>
            <h2 className="m-0 text-[1.8rem] font-extrabold leading-[1.12] text-(--seis-text-primary) sm:text-[2.75rem]">
              Finding code is trivial.{' '}
              <span className="text-(--seis-cyan)">
                Understanding systemic coupling and evolution is not.
              </span>
            </h2>
            <p className="m-0 mt-5 text-[18px] leading-[1.6] text-(--seis-text-secondary)">
              Living codebases accumulate hidden dependencies, circular references, and hotspots where
              change frequency intersects high complexity. Standard static analysis tells you what syntax
              exists today, but cannot explain how the system evolved or which modules present high
              blast-radius risks.
            </p>
          </div>
        </FadeIn>

        <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4.5">
          {problems.map((item, index) => {
            const Icon = item.icon;
            return (
              <FadeIn key={item.title} direction="up" delay={index * 60} className="h-full">
                <article className="group flex h-full min-h-60 flex-col justify-between rounded-lg border border-(--seis-border-subtle) bg-(--seis-surface-1) p-6 transition-all duration-300 hover:border-(--seis-cyan)/40 hover:shadow-[0_4px_20px_rgba(25,190,213,0.06)]">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-(--seis-cyan)/30 bg-(--seis-highlight) text-(--seis-cyan) transition-transform duration-300 group-hover:scale-110">
                        <Icon size={16} />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-(--seis-text-muted) transition-colors group-hover:text-(--seis-cyan)">
                        0{index + 1}
                      </span>
                    </div>

                    <h3 className="m-0 text-left text-[17px] font-bold text-(--seis-text-primary) transition-colors group-hover:text-(--seis-cyan)">
                      {item.title}
                    </h3>

                    <p className="m-0 mt-2 text-left text-[16px] leading-relaxed text-(--seis-text-secondary)">
                      {item.body}
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
