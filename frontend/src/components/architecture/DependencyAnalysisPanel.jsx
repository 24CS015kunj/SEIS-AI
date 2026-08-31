import React from 'react';
import { GitCommit, Network, Sparkles } from 'lucide-react';

/**
 * Honest empty states (Task 69) -- no dependency-graph or circular-
 * dependency-detection engine exists anywhere in this codebase (confirmed
 * by inspection across Tasks 67-69: `TrendDetector`/`ChurnCalculator`
 * group files by directory and churn, never by import/require
 * relationships). Rather than draw arrows between directories because
 * they happen to both exist, this section says so plainly. `analysis` is
 * Task 69's real, separate, deterministic evolution-analysis result
 * (churn/hotspots/trends) -- shown here only as a status pointer, never
 * mislabeled as a dependency graph.
 */
export default function DependencyAnalysisPanel({ analysisStatus, analysis, repositoryHref }) {
  return (
    <section aria-labelledby="dependency-analysis-heading">
      <div className="flex items-center gap-2 mb-3">
        <Network size={15} className="text-blue-600" aria-hidden="true" />
        <h2 id="dependency-analysis-heading" className="text-[13.5px] font-bold text-slate-900">
          Dependency Analysis
        </h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
            <Network size={22} className="text-slate-400" aria-hidden="true" />
          </div>
          <p className="text-[13.5px] font-semibold text-slate-700 m-0 mb-1">
            Dependency relationships are not available for this repository.
          </p>
          <p className="text-[12px] text-slate-500 mt-1 m-0 max-w-[440px] leading-relaxed">
            No dependency-graph analysis engine exists in this project yet -- this is never inferred from directory
            names or file proximity.
          </p>
        </div>
        <div className="text-center pt-4 border-t border-slate-100">
          <p className="text-[13px] text-slate-500 m-0">Circular dependency analysis: Not available.</p>
        </div>

        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3">
          <GitCommit size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-700 m-0 mb-1">
              Related: Repository Evolution Analysis
            </p>
            <p className="text-[11.5px] text-slate-500 leading-relaxed m-0">
              {analysisStatus === 'ready' && analysis
                ? `A commit-churn-based analysis exists (${analysis.insights?.length ?? 0} finding${
                    analysis.insights?.length === 1 ? '' : 's'
                  }, generated ${analysis.generatedAt ? new Date(analysis.generatedAt).toLocaleString() : 'recently'}). This groups files by how often they change together -- it is not a dependency/import graph.`
                : analysisStatus === 'error'
                  ? 'Could not check whether an evolution analysis exists for this repository.'
                  : analysisStatus === 'loading'
                    ? 'Checking for an existing evolution analysis…'
                    : 'No evolution analysis has been generated yet. Generate one from the Dashboard\'s AI Insights panel.'}
            </p>
            {repositoryHref && (
              <a
                href={`${repositoryHref}#insights`}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-600 hover:text-blue-700 mt-2"
              >
                <Sparkles size={11} aria-hidden="true" />
                Open AI Insights
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
