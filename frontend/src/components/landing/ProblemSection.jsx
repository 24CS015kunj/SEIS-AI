import React from 'react';
import FadeIn from '../common/FadeIn';

const problems = [
  {
    num: '01',
    title: 'COMPLEX CODEBASES',
    body: 'Large repositories can be difficult to navigate.',
  },
  {
    num: '02',
    title: 'SCATTERED KNOWLEDGE',
    body: 'Architecture, business logic and dependencies are spread across the project.',
  },
  {
    num: '03',
    title: 'MANUAL EXPLORATION',
    body: 'Developers spend hours tracing files, dependencies and history.',
  },
  {
    num: '04',
    title: 'SLOW ONBOARDING',
    body: 'New developers need significant time before contributing confidently.',
  },
];

export default function ProblemSection() {
  return (
    <section className="section-padding bg-transparent">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8">
        
        <FadeIn direction="left">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            
            {/* Left Column - Text */}
            <div className="lg:col-span-5">
              <h2 className="headline-lg mb-6">
                The Hard Part Isn't Finding the Code.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">It's Understanding How It Fits Together.</span>
              </h2>
              
              <p className="body-lg">
                Modern software repositories contain thousands of files, dependencies, commits and architectural decisions. When developers join an unfamiliar project, they often have to reconstruct that understanding manually.
              </p>
            </div>

            {/* Right Column - 4 points */}
            <div className="lg:col-span-6 lg:col-start-7">
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-10 py-2">
                {problems.map((p, i) => (
                  <FadeIn key={p.num} direction="right" delay={i * 100}>
                    <div className="relative pl-10">
                      {/* Timeline Circle Bullet */}
                      <div className="absolute top-[-2px] -left-[17px] w-8 h-8 bg-[#FAFAFA] border-2 border-indigo-200 rounded-full flex items-center justify-center">
                        <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full" />
                      </div>
                      
                      <div className="pt-0.5">
                        <h3 className="text-[13px] font-bold text-slate-900 tracking-widest uppercase mb-2">
                          {p.title}
                        </h3>
                        <p className="text-[15px] text-slate-500 leading-relaxed">
                          {p.body}
                        </p>
                      </div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>

          </div>
        </FadeIn>

      </div>
    </section>
  );
}
