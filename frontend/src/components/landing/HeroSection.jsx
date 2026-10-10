import React, { useEffect, useState } from 'react';
import { GitBranch, Terminal } from 'lucide-react';
import FadeIn from '../common/FadeIn';
import HeroRobotShowcase from './HeroRobotShowcase';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener?.('change', sync);
    return () => mediaQuery.removeEventListener?.('change', sync);
  }, []);

  return reduced;
}

function TypedLabel({ labels, interval = 2600 }) {
  const reducedMotion = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) return undefined;

    let swapTimer;
    const timer = setInterval(() => {
      setVisible(false);
      swapTimer = setTimeout(() => {
        setIdx((i) => (i + 1) % labels.length);
        setVisible(true);
      }, 260);
    }, interval);

    return () => {
      clearInterval(timer);
      clearTimeout(swapTimer);
    };
  }, [interval, labels.length, reducedMotion]);

  return (
    <span
      className="inline-block text-(--seis-cyan)"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-6px)',
        transition: reducedMotion ? 'none' : 'opacity 0.26s ease, transform 0.26s ease',
      }}
    >
      {labels[idx]}
    </span>
  );
}

export default function HeroSection({ onOpenAuth }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section id="hero" className="relative overflow-hidden border-b border-(--seis-border-subtle) bg-(--seis-canvas)">
      {/* Ambient gradient glow backdrop without grid lines */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-100 w-200 -translate-x-1/2 bg-radial from-(--seis-cyan)/18 via-sky-400/8 to-transparent blur-3xl" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-310 px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8">
        <div
          className="mx-auto max-w-232.5 text-center"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.65s cubic-bezier(0.22,1,0.36,1), transform 0.65s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <h1 className="m-0 text-[2.6rem] leading-[1.04] font-extrabold text-(--seis-text-primary) sm:text-[3.65rem] lg:text-[4.6rem]">
            Turn <TypedLabel labels={['living code', 'architecture drift', 'dependency risk', 'commit churn']} />
            <br className="hidden sm:block" /> into engineering intelligence.
          </h1>

          <p className="mx-auto mt-6 max-w-180 text-[18px] leading-relaxed text-(--seis-text-secondary) sm:text-[20px]">
            Connect a repository to map source structure, analyze dependencies, and get grounded engineering insights with file-level citations.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              id="hero-cta-connect"
              type="button"
              onClick={() => onOpenAuth?.('github')}
              className="btn-tool-primary h-12 px-7 text-[15px]"
            >
              <GitBranch size={15} aria-hidden="true" />
              <span>Connect Repository</span>
            </button>

            <a href="#how-it-works" className="btn-tool-secondary h-12 px-6 text-[15px] no-underline">
              <Terminal size={15} />
              <span>Explore Pipeline</span>
            </a>
          </div>
        </div>

        <FadeIn direction="up" delay={120}>
          <HeroRobotShowcase />
        </FadeIn>
      </div>
    </section>
  );
}
