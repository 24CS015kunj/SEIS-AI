import React from 'react';
import { Check, Layers, FolderGit2, Sparkles } from 'lucide-react';

const ONBOARDING_STEPS = [
  { id: 1, label: 'Workspace Setup', icon: Layers, desc: 'Define your team space' },
  { id: 2, label: 'Connect Repository', icon: FolderGit2, desc: 'Select codebase to analyze' },
  { id: 3, label: 'AI Ingestion & Activation', icon: Sparkles, desc: 'Index code & architecture' },
];

export default function OnboardingStepper({ currentStep = 1, onStepClick }) {
  return (
    <div className="w-full mb-6 font-mono">
      <nav aria-label="Onboarding Progress" className="max-w-2xl mx-auto">
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
                    className={`absolute top-4 -left-1/2 right-1/2 h-[1px] -translate-y-1/2 z-0 transition-colors ${
                      step.id <= currentStep ? 'bg-[var(--seis-brand-blue)]' : 'bg-[var(--seis-border-subtle)]'
                    }`}
                  />
                )}

                {/* Step Circle Button / Badge */}
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick(step.id)}
                  className={`relative z-10 w-8 h-8 rounded border flex items-center justify-center font-mono text-[11px] font-bold transition-all ${
                    isCompleted
                      ? 'bg-[var(--seis-brand-blue)] border-[var(--seis-brand-blue)] text-white'
                      : isCurrent
                        ? 'bg-[var(--seis-surface-2)] border-[var(--seis-brand-blue)] text-[var(--seis-brand-blue)] ring-2 ring-blue-500/20'
                        : 'bg-[var(--seis-surface-1)] border-[var(--seis-border-subtle)] text-[var(--seis-text-muted)]'
                  } ${isClickable ? 'cursor-pointer hover:border-[var(--seis-brand-blue)]' : 'cursor-default'}`}
                  aria-label={`Step ${step.id}: ${step.label} (${
                    isCompleted ? 'Completed' : isCurrent ? 'Current' : 'Upcoming'
                  })`}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </button>

                {/* Step Text Label */}
                <div className="text-center mt-2 px-1">
                  <span
                    className={`block text-[11.5px] font-semibold tracking-tight transition-colors ${
                      isCurrent
                        ? 'text-[var(--seis-text-primary)]'
                        : isCompleted
                          ? 'text-[var(--seis-text-secondary)]'
                          : 'text-[var(--seis-text-muted)]'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="hidden sm:block text-[10.5px] text-[var(--seis-text-muted)] mt-0.5">
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
