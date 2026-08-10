import React from 'react';
import FadeIn from '../common/FadeIn';

export default function Footer({ onOpenDocs }) {
  return (
    <footer className="section-padding-sm bg-transparent border-t border-[#E2E8F0]">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
        
        <FadeIn direction="up">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            <div className="lg:col-span-1">
              <h3 className="text-base font-bold text-slate-900 mb-3">SEIS AI Copilot</h3>
              <p className="body-sm m-0">AI-powered software engineering intelligence.</p>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900 tracking-widest uppercase mb-4">PRODUCT</h4>
              <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                <li><a href="#features" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">Features</a></li>
                <li><a href="#how-it-works" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">Workflow</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900 tracking-widest uppercase mb-4">COMPANY</h4>
              <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                <li><a href="#who-uses-seis" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">About Us</a></li>
                <li><a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">Privacy</a></li>
                <li><a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-slate-900 tracking-widest uppercase mb-4">RESOURCES</h4>
              <ul className="flex flex-col gap-3 m-0 p-0 list-none">
                <li><a href="https://github.com" target="_blank" rel="noreferrer" className="text-sm text-slate-500 hover:text-slate-900 transition-colors no-underline">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-[#E2E8F0] flex justify-between items-center">
            <span className="text-sm text-slate-400">© 2026 SEIS AI Copilot</span>
          </div>
        </FadeIn>

      </div>
    </footer>
  );
}
