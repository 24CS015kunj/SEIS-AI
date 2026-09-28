import React from 'react';
import FadeIn from '../common/FadeIn';
import { Code2, ShieldCheck, UserPlus, Check } from 'lucide-react';

const roles = [
  {
    id: 'developers',
    title: 'Developers',
    roleTag: 'Codebase Comprehension',
    body: 'Understand unfamiliar repositories, trace complex dependencies, and grasp architectural intent in minutes.',
    icon: Code2,
    accentColor: 'text-blue-600',
    iconBg: 'bg-blue-50 border-blue-200/80',
    borderHover: 'hover:border-blue-300 hover:shadow-blue-500/8',
    highlights: [
      'AST-based dependency & flow graphs',
      'Grounded code explanations with file links',
      'Fast ramp-up on unfamiliar modules',
    ],
  },
  {
    id: 'tech-leads',
    title: 'Tech Leads',
    roleTag: 'Architecture & Governance',
    body: 'Understand architectural drift, assess pull request impact, and monitor engineering risks across services.',
    icon: ShieldCheck,
    accentColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50 border-indigo-200/80',
    borderHover: 'hover:border-indigo-300 hover:shadow-indigo-500/8',
    highlights: [
      'System-wide technical debt detection',
      'Pull request blast-radius analysis',
      'Hotspot & high-churn module tracking',
    ],
  },
  {
    id: 'contributors',
    title: 'New Contributors',
    roleTag: 'Rapid Onboarding',
    body: 'Gain a solid mental model of the codebase on day one without wading through thousands of lines manually.',
    icon: UserPlus,
    accentColor: 'text-sky-600',
    iconBg: 'bg-sky-50 border-sky-200/80',
    borderHover: 'hover:border-sky-300 hover:shadow-sky-500/8',
    highlights: [
      'Interactive architecture blueprints',
      'Natural language repository copilot',
      'Accelerated path to first approved PR',
    ],
  },
];

export default function EngineeringRolesSection() {
  return (
    <section id="who-uses-seis" className="section-padding bg-transparent relative overflow-hidden">
      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8 relative z-10">
        
        <FadeIn direction="up">
          <div className="section-header-centered mb-14 text-center max-w-[700px] mx-auto">
            <div className="eyebrow mb-2.5">WHO USES SEIS?</div>
            <h2 className="headline-lg font-bold tracking-tight text-slate-900 mb-4">
              Engineered for <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Engineering Teams</span>
            </h2>
            <p className="text-[15px] text-slate-500 leading-relaxed max-w-[560px] mx-auto m-0">
              Purpose-built intelligence for every engineer navigating, reviewing, and evolving complex codebases.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <FadeIn key={role.id} direction="up" delay={i * 120}>
                <div
                  className={`bg-white border border-slate-200/90 rounded-2xl p-7 lg:p-8 h-full flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${role.borderHover} group`}
                >
                  <div>
                    {/* Top Row: Icon + Role Tag */}
                    <div className="flex items-center justify-between gap-3 mb-6">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${role.iconBg} ${role.accentColor} transition-transform duration-300 group-hover:scale-105 shadow-2xs`}>
                        <Icon size={22} strokeWidth={1.8} />
                      </div>
                      <span className="text-[11.5px] font-semibold text-slate-600 bg-slate-100/90 border border-slate-200/70 rounded-full px-3 py-1 tracking-wide">
                        {role.roleTag}
                      </span>
                    </div>

                    {/* Title & Body */}
                    <h3 className="text-[19px] font-bold text-slate-900 tracking-tight mb-2.5">
                      {role.title}
                    </h3>
                    <p className="text-[14px] text-slate-500 leading-relaxed mb-6">
                      {role.body}
                    </p>
                  </div>

                  {/* Highlights List */}
                  <div className="pt-5 border-t border-slate-100 space-y-2.5">
                    {role.highlights.map((item) => (
                      <div key={item} className="flex items-start gap-2.5 text-[13px] text-slate-700">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${role.iconBg} ${role.accentColor}`}>
                          <Check size={10} strokeWidth={2.5} />
                        </div>
                        <span className="leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
