import React from 'react';
import FadeIn from '../common/FadeIn';
import BrandMark from '../common/BrandMark';

export default function Footer({ onOpenDocs }) {
  const linkClass = 'text-[13px] text-(--seis-text-secondary) transition-colors hover:text-(--seis-cyan) no-underline';

  return (
    <footer className="border-t border-(--seis-border-subtle) bg-(--seis-surface-1) py-14">
      <div className="mx-auto max-w-310 px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up">
          <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BrandMark size={24} />
                <span className="font-mono text-[14px] font-bold text-(--seis-text-primary)">SEIS-AI</span>
              </div>
              <p className="m-0 text-[13px] leading-relaxed text-(--seis-text-secondary)">
                Repository intelligence for understanding architecture, dependencies, and code evolution.
              </p>
            </div>
            <div>
              <h4 className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-wider text-(--seis-text-muted)">SYSTEM</h4>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li><a href="#hero" className={linkClass}>Overview</a></li>
                <li><a href="#features" className={linkClass}>Capabilities</a></li>
                <li><a href="#how-it-works" className={linkClass}>Intelligence Pipeline</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-wider text-(--seis-text-muted)">ROLES</h4>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li><a href="#who-uses-seis" className={linkClass}>Staff Engineers &amp; Architects</a></li>
                <li><a href="#who-uses-seis" className={linkClass}>Tech Leads &amp; Managers</a></li>
                <li><a href="#who-uses-seis" className={linkClass}>New Contributors</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-wider text-(--seis-text-muted)">RESOURCES</h4>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                <li>
                  <button type="button" onClick={onOpenDocs} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-(--seis-text-secondary) transition-colors hover:text-(--seis-cyan)">
                    Documentation
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-(--seis-border-subtle) pt-6 font-mono text-[11px] text-(--seis-text-muted) sm:flex-row">
            <span>
              (c) {new Date().getFullYear()} SEIS AI
            </span>
            <div className="flex items-center gap-3">
              <span>FastAPI AI Service</span>
              <span>/</span>
              <span>Express Business Layer</span>
              <span>/</span>
              <span>React AST Shell</span>
            </div>
          </div>
        </FadeIn>
      </div>
    </footer>
  );
}
