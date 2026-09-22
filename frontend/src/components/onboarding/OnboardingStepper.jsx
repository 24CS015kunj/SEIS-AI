import React from 'react';
import { Check, Layers, FolderGit2, Sparkles } from 'lucide-react';

const ONBOARDING_STEPS = [
  { id: 1, label: 'Workspace Setup', icon: Layers, desc: 'Define your team space' },
  { id: 2, label: 'Connect Repository', icon: FolderGit2, desc: 'Select codebase to analyze' },
  { id: 3, label: 'AI Ingestion & Activation', icon: Sparkles, desc: 'Index code & architecture' },
];

export default function OnboardingStepper({ currentStep = 1, onStepClick }) {
  return (
    <div className="w-full mb-8">
      <nav aria-label="Onboarding Progress" className="max-w-3xl mx-auto">
        <ol className="flex items-center justify-between w-full relative">
          {ONBOARDING_STEPS.map((step, idx) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const isClickable = Boolean(onStepClick) && isCompleted;
            const Icon = step.icon;

            return (
              <li
                key={step.id}
                className="flex-1 flex flex-col items-center relative group"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* Connecting Line between steps */}
                {idx > 0 && (
                  <div
                    aria-hidden="true"
                    className={`absolute top-5 -left-1/2 right-1/2 h-0.5 -translate-y-1/2 z-0 transition-all duration-300 ${
                      step.id <= currentStep ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Step Circle Button / Badge */}
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(step.id)}
                  className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold text-[13px] transition-all duration-200 ${
                    isCompleted
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:scale-105'
                      : isCurrent
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white ring-4 ring-blue-100 shadow-lg shadow-blue-600/30 scale-105'
                        : 'bg-white border-2 border-slate-200 text-slate-400'
                  } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-label={`Step ${step.id}: ${step.label} (${
                    isCompleted ? 'Completed' : isCurrent ? 'Current' : 'Upcoming'
                  })`}
                >
                  {isCompleted ? (
                    <Check size={16} strokeWidth={2.8} className="animate-in fade-in" />
                  ) : (
                    <Icon size={16} className={isCurrent ? 'text-white' : 'text-slate-400'} />
                  )}
                </button>

                {/* Step Text Label */}
                <div className="text-center mt-2.5 px-1">
                  <span
                    className={`block text-[12px] sm:text-[13px] font-bold tracking-tight transition-colors ${
                      isCurrent
                        ? 'text-slate-900'
                        : isCompleted
                          ? 'text-slate-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="hidden sm:block text-[11px] text-slate-400 font-medium mt-0.5">
                    {step.desc}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
