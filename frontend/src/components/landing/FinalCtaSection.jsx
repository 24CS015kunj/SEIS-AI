import React from 'react';
import { GitBranch } from 'lucide-react';
import FadeIn from '../common/FadeIn';

export default function FinalCtaSection({ onOpenAuth }) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)] py-20 sm:py-28">
      <div className="mx-auto max-w-[800px] px-4 sm:px-6 text-center relative z-10">
        <FadeIn direction="up">
          <div className="eyebrow">
            GET STARTED WITH REPOSITORY INTELLIGENCE
          </div>

          <h2 className="text-[1.8rem] sm:text-[2.55rem] lg:text-[3.25rem] font-extrabold text-[var(--seis-text-primary)] leading-tight m-0">
            Map Architecture and Detect Hotspots <br />
            <span className="text-[var(--seis-cyan)]">
              Before Your Next Release.
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-[560px] text-[17px] sm:text-[18px] leading-relaxed text-[var(--seis-text-secondary)] m-0">
            Connect a repository to generate deterministic AST models, dependency graphs,
            and churn intelligence. Zero complex configuration required.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              type="button"
              id="final-cta-connect"
              onClick={() => onOpenAuth?.('github')}
              className="btn-tool-primary h-11 px-6 text-[15px]"
            >
              <GitBranch size={15} aria-hidden="true" />
              <span>Connect Repository</span>
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
