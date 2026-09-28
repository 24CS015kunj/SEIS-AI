import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, SearchX } from 'lucide-react';
import BrandMark from '../components/common/BrandMark';

/**
 * Catch-all for any URL that doesn't match a declared route. Previously
 * missing entirely -- React Router rendered nothing at all (a blank page)
 * for a mistyped or stale link, with no way back into the app.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[440px] bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] px-8 py-12 text-center">
        <Link to="/" className="inline-flex items-center justify-center mb-6 no-underline" aria-label="SEIS AI Copilot — back to homepage">
          <BrandMark size={40} />
        </Link>
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
          <SearchX size={22} className="text-slate-400" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Page not found</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          The page you're looking for doesn't exist, or the link may be out of date.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-blue-600 text-white text-[14px] font-semibold no-underline transition-colors hover:bg-blue-700"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to homepage
        </Link>
      </div>
    </div>
  );
}
