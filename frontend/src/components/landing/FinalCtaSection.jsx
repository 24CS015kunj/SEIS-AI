import React from 'react';
import { Rocket } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';
import FadeIn from '../common/FadeIn';

export default function FinalCtaSection({ onOpenAuth }) {
  return (
    <section className="section-padding relative overflow-hidden bg-gradient-to-r from-[#0071E3] via-[#4361EE] to-[#5856D6]">
      {/* Luminous Apple Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-white/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative max-w-[1280px] w-full mx-auto px-6 lg:px-8 text-center z-10">
        <FadeIn direction="scale">
          <h2 className="headline-lg max-w-[620px] mx-auto mb-5 !text-white font-bold tracking-tight">
            Understand Your Architecture Before You Change It.
          </h2>
          <p className="body-lg max-w-[520px] mx-auto mb-9 !text-white/85">
            Connect your GitHub repository and experience seamless codebase intelligence today.
          </p>
          <button
            onClick={() => onOpenAuth('github')}
            className="inline-flex items-center justify-center gap-2.5 h-12 px-8 bg-white text-[#1D1D1F] text-[15px] font-semibold rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.12)] cursor-pointer border-0 hover:scale-102 active:scale-97 transition-all duration-200"
          >
            <GithubIcon className="w-5 h-5" />
            <span>Connect Repository</span>
            <Rocket className="w-4 h-4 text-[#0071E3]" />
          </button>
        </FadeIn>
      </div>
    </section>
  );
}
