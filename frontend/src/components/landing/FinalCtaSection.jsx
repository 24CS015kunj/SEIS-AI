import React from 'react';
import GithubIcon from '../common/GithubIcon';
import FadeIn from '../common/FadeIn';

export default function FinalCtaSection({ onOpenAuth }) {
  return (
    <section className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8 text-center">
        
        <FadeIn direction="scale">
          <h2 className="headline-lg max-w-[600px] mx-auto mb-6">
            Understand Your Software Before You Change It.
          </h2>
          <p className="body-lg max-w-[500px] mx-auto mb-10">
            Connect your GitHub repository and start exploring your project with SEIS.
          </p>
          <button onClick={() => onOpenAuth('github')} className="btn-primary" style={{ padding: '0 28px' }}>
            <GithubIcon className="w-5 h-5" />
            Continue with GitHub
          </button>
        </FadeIn>

      </div>
    </section>
  );
}
