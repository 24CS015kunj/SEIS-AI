import React from 'react';
import { Rocket } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';
import FadeIn from '../common/FadeIn';

export default function FinalCtaSection({ onOpenAuth }) {
  return (
    <section className="section-padding relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600">
      {/* Subtle dot texture, consistent with the base page background pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="relative max-w-[1280px] w-full mx-auto px-6 lg:px-8 text-center">

        <FadeIn direction="scale">
          <h2 className="headline-lg max-w-[600px] mx-auto mb-6 !text-white">
            Understand Your Software Before You Change It.
          </h2>
          <p className="body-lg max-w-[500px] mx-auto mb-10 !text-blue-100">
            Connect your GitHub repository and start exploring your project with SEIS.
          </p>
          <button
            onClick={() => onOpenAuth('github')}
            className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-white text-slate-900 text-base font-semibold rounded-lg shadow-lg cursor-pointer border-0 hover:bg-slate-100 hover:-translate-y-0.5 transition-all"
          >
            <GithubIcon className="w-5 h-5" />
            Start Free Trial
            <Rocket className="w-4 h-4" />
          </button>
        </FadeIn>

      </div>
    </section>
  );
}
