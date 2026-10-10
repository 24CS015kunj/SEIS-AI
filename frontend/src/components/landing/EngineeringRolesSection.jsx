import React from 'react';
import { Circle, Code2, ShieldCheck, UserPlus } from 'lucide-react';
import FadeIn from '../common/FadeIn';

const roles = [
  {
    tag: 'CODEBASE COMPREHENSION',
    title: 'Senior Engineers & Contributors',
    body: 'Understand unfamiliar repositories, trace complex dependencies, and grasp architectural intent in minutes.',
    icon: Code2,
    features: [
      'AST-based dependency & flow graphs',
      'Grounded code explanations with file links',
      'Fast ramp-up on unfamiliar modules',
    ],
  },
  {
    tag: 'GOVERNANCE & DRIFT',
    title: 'Tech Leads & Architects',
    body: 'Understand architectural drift, assess pull request impact, and monitor engineering risks across services.',
    icon: ShieldCheck,
    features: [
      'System-wide technical debt detection',
      'Circular import & coupling diagnostics',
      'Hotspot & high-churn module tracking',
    ],
  },
  {
    tag: 'RAPID ONBOARDING',
    title: 'New Team Members',
    body: 'Gain a solid mental model of the codebase on day one without wading through thousands of lines manually.',
    icon: UserPlus,
    features: [
      'Automated architecture summaries',
      'Natural-language repository Copilot',
      'Accelerated path to first approved PR',
    ],
  },
];

export default function EngineeringRolesSection() {
  return (
    <section id="who-uses-seis" className="border-b border-(--seis-border-subtle) bg-(--seis-canvas) py-16 sm:py-24">
      <div className="mx-auto w-full max-w-310 px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="mx-auto mb-12 max-w-180 text-center">
            <div className="eyebrow">
              ENGINEERING ROLES
            </div>
            <h2 className="m-0 text-[1.8rem] leading-tight font-extrabold text-(--seis-text-primary) sm:text-[2.55rem]">
              Built for <span className="text-(--seis-cyan)">Engineering</span> Velocity
            </h2>
            <p className="mx-auto mt-4 m-0 max-w-150 text-[17px] leading-relaxed text-(--seis-text-secondary)">
              Purpose-built intelligence for every engineer navigating, reviewing, and evolving complex codebases.
            </p>
          </div>
        </FadeIn>

        <div className="grid gap-4 lg:grid-cols-3">
          {roles.map((role, index) => {
            const Icon = role.icon;
            return (
              <FadeIn key={role.title} direction="up" delay={index * 60}>
                <article className="group flex h-full flex-col justify-between rounded-lg border border-(--seis-border-subtle) bg-(--seis-surface-1) p-6 transition-all duration-300 hover:border-(--seis-cyan)/40 hover:shadow-[0_4px_20px_rgba(25,190,213,0.06)]">
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-(--seis-cyan)/30 bg-(--seis-highlight) text-(--seis-cyan) transition-transform duration-300 group-hover:scale-110">
                        <Icon size={16} />
                      </div>
                      <span className="badge-tag">
                        {role.tag}
                      </span>
                    </div>

                    <h3 className="m-0 text-lg font-bold text-(--seis-text-primary) transition-colors group-hover:text-(--seis-cyan)">
                      {role.title}
                    </h3>
                    <p className="m-0 mt-2 text-[16px] leading-relaxed text-(--seis-text-secondary)">
                      {role.body}
                    </p>
                  </div>

                  <div className="mt-6 space-y-2 border-t border-(--seis-border-subtle) pt-4">
                    {role.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-[14px] text-(--seis-text-primary)">
                        <Circle size={7} className="shrink-0 fill-(--seis-cyan) text-(--seis-cyan)" strokeWidth={0} aria-hidden="true" />
                        <span>{feature}</span>
                      </div>
                    ))}
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
