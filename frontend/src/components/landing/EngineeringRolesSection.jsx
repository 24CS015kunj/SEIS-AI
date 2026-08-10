import React from 'react';
import FadeIn from '../common/FadeIn';
import { Code2, ShieldCheck, UserPlus } from 'lucide-react';

const roles = [
  { 
    title: 'Developers', 
    body: 'Understand unfamiliar repositories and dependencies faster.',
    icon: Code2,
    gradient: 'from-blue-500 to-indigo-500'
  },
  { 
    title: 'Tech Leads', 
    body: 'Understand architecture, project activity, and engineering risks.',
    icon: ShieldCheck,
    gradient: 'from-purple-500 to-pink-500'
  },
  { 
    title: 'New Contributors', 
    body: 'Get project context without manually reading the entire codebase.',
    icon: UserPlus,
    gradient: 'from-emerald-400 to-teal-500'
  },
];

export default function EngineeringRolesSection() {
  return (
    <section id="who-uses-seis" className="section-padding bg-transparent mt-12 relative overflow-hidden">
      
      {/* Background ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-[1280px] w-full mx-auto px-6 lg:px-8 relative z-10">
        
        <FadeIn direction="right">
          <div className="section-header-centered mb-16">
            <div className="eyebrow mb-3">WHO USES SEIS?</div>
            <h2 className="headline-lg">
              Engineered for <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Engineering Teams</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <FadeIn key={role.title} direction="scale" delay={i * 150}>
                <div className="group relative bg-slate-50/50 hover:bg-white border border-slate-200 hover:border-indigo-200/60 rounded-3xl p-8 md:p-10 h-full transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer overflow-hidden z-10">
                  
                  {/* Decorative corner glow */}
                  <div className={`absolute -top-16 -right-16 w-48 h-48 bg-gradient-to-br ${role.gradient} blur-[60px] opacity-[0.08] group-hover:opacity-20 transition-opacity duration-700 pointer-events-none`} />

                  {/* Watermark Icon */}
                  <div className="absolute -bottom-8 -right-8 text-slate-200/40 group-hover:text-indigo-100/60 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-12 pointer-events-none z-0">
                    <Icon size={160} strokeWidth={0.7} />
                  </div>

                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 bg-gradient-to-br ${role.gradient} shadow-lg shadow-slate-200/50 text-white group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 relative z-10`}>
                    <Icon size={26} strokeWidth={1.5} />
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-[17px] font-extrabold text-slate-900 tracking-wide mb-3">
                      {role.title}
                    </h3>
                    <p className="text-[15px] text-slate-500 leading-relaxed m-0 group-hover:text-slate-600 transition-colors duration-300">
                      {role.body}
                    </p>
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
