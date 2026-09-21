import React, { useMemo, useState } from 'react';
import { Eye, Flame, Info, Sparkles, X } from 'lucide-react';
import { calculateHotspotAnalytics } from '../../utils/hotspotAnalytics';

const RISK_TIERS = {
  Critical: { label: 'Critical', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  High: { label: 'High', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  Moderate: { label: 'Moderate', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  Low: { label: 'Low', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
};

/**
 * Task: Engineering Hotspots & Risk Areas Component.
 * Identifies high-risk/high-attention files & directories using transparent,
 * deterministic metrics (frequency, churn, recency, contributors, AI risk signals).
 * 100% real GitHub data, zero mock values.
 */
export default function EngineeringHotspotsSection({
  commits,
  dashboardData,
  analysisData,
  loading,
  onPreviewFile,
}) {
  const [viewMode, setViewMode] = useState('files'); // 'files' | 'directories'
  const [selectedHotspot, setSelectedHotspot] = useState(null);

  const analytics = useMemo(() => {
    return calculateHotspotAnalytics(commits, dashboardData, analysisData, 30);
  }, [commits, dashboardData, analysisData]);

  const activeHotspots = viewMode === 'files' ? analytics.fileHotspots || [] : analytics.dirHotspots || [];

  return (
    <section
      role="region"
      aria-label="Engineering Hotspots and Risk Areas"
      className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col gap-5"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-amber-600 shrink-0" aria-hidden="true" />
            <h2 className="text-[15px] font-bold text-slate-900 m-0 leading-tight">
              Engineering Hotspots &amp; Risk Areas
            </h2>
          </div>
          <p className="text-[12px] text-slate-500 m-0 mt-0.5">
            Areas receiving the most engineering activity and technical attention.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div
          role="group"
          aria-label="Select hotspot aggregation mode"
          className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start sm:self-auto shrink-0"
        >
          <button
            type="button"
            id="hotspot-mode-files"
            onClick={() => setViewMode('files')}
            aria-pressed={viewMode === 'files'}
            className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${
              viewMode === 'files'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            Hotspot Files
          </button>
          <button
            type="button"
            id="hotspot-mode-directories"
            onClick={() => setViewMode('directories')}
            aria-pressed={viewMode === 'directories'}
            className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${
              viewMode === 'directories'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            Hotspot Directories
          </button>
        </div>
      </div>

      {loading ? (
        <HotspotSkeleton />
      ) : !analytics.available ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-[13px] text-slate-500 m-0 font-medium">{analytics.reason}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {analytics.isLimitedHistory && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-50/70 border border-blue-100 text-[12px] text-blue-800">
              <Info size={14} className="text-blue-600 shrink-0" aria-hidden="true" />
              <span>{analytics.historyBannerMessage}</span>
            </div>
          )}

          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Hotspots Detected
              </span>
              <span className="text-[20px] font-bold font-mono text-slate-900 mt-1">
                {analytics.summary.totalHotspotsDetected}
              </span>
            </div>

            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                High-Risk Areas
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-[20px] font-bold font-mono ${
                    analytics.summary.highRiskAreasCount > 0 ? 'text-amber-600' : 'text-slate-900'
                  }`}
                >
                  {analytics.summary.highRiskAreasCount}
                </span>
                <span className="text-[11px] text-slate-400">critical/high</span>
              </div>
            </div>

            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Most Changed File
              </span>
              <span className="text-[12px] font-mono font-semibold text-slate-800 truncate mt-1" title={analytics.summary.mostChangedPath}>
                {analytics.summary.mostChangedPath}
              </span>
              <span className="text-[11px] font-mono text-blue-600">
                {analytics.summary.mostChangedCount} changes
              </span>
            </div>

            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                Highest Churn File
              </span>
              <span className="text-[12px] font-mono font-semibold text-slate-800 truncate mt-1" title={analytics.summary.highestChurnPath}>
                {analytics.summary.highestChurnPath}
              </span>
              <span className="text-[11px] font-mono text-emerald-600">
                {analytics.summary.highestChurnVal.toLocaleString()} lines churn
              </span>
            </div>
          </div>

          {/* Risk Distribution Progress Bar */}
          <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="font-semibold text-slate-700">Risk Level Distribution</span>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-rose-700">{analytics.summary.riskCounts.Critical || 0} Critical</span>
                <span className="text-amber-700">{analytics.summary.riskCounts.High || 0} High</span>
                <span className="text-blue-700">{analytics.summary.riskCounts.Moderate || 0} Moderate</span>
                <span className="text-slate-600">{analytics.summary.riskCounts.Low || 0} Low</span>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
              {analytics.summary.totalHotspotsDetected > 0 && (
                <>
                  <div
                    className="h-full bg-rose-500 transition-all"
                    style={{
                      width: `${((analytics.summary.riskCounts.Critical || 0) / analytics.summary.totalHotspotsDetected) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{
                      width: `${((analytics.summary.riskCounts.High || 0) / analytics.summary.totalHotspotsDetected) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: `${((analytics.summary.riskCounts.Moderate || 0) / analytics.summary.totalHotspotsDetected) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-slate-400 transition-all"
                    style={{
                      width: `${((analytics.summary.riskCounts.Low || 0) / analytics.summary.totalHotspotsDetected) * 100}%`,
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Top Hotspot List */}
          <div className="space-y-2">
            {activeHotspots.length === 0 ? (
              <p className="text-[12.5px] text-slate-500 p-4 text-center">
                No active {viewMode} detected in selected date range.
              </p>
            ) : (
              activeHotspots.map((hotspot) => {
                const tier = RISK_TIERS[hotspot.riskLevel] || RISK_TIERS.Low;
                return (
                  <div
                    key={hotspot.path}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200/90 hover:border-blue-300 transition-all shadow-2xs"
                  >
                    {/* Left: Risk Tier & Path */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border shrink-0 ${tier.bg} ${tier.text} ${tier.border}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${tier.dot}`} aria-hidden="true" />
                        {hotspot.scores.total} / 100
                      </span>

                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-[12.5px] font-bold text-slate-900 truncate" title={hotspot.path}>
                          {hotspot.path}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono mt-0.5">
                          <span>{hotspot.changeCount} changes</span>
                          <span>·</span>
                          <span>{hotspot.churn.toLocaleString()} lines churn</span>
                          <span>·</span>
                          <span>{hotspot.contributorsCount} contributors</span>
                          <span>·</span>
                          <span>{hotspot.daysSinceModified <= 0 ? 'Today' : `${hotspot.daysSinceModified}d ago`}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: AI Signals & Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {hotspot.aiInsights.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold">
                          <Sparkles size={12} aria-hidden="true" />
                          {hotspot.aiInsights.length} AI Signal{hotspot.aiInsights.length === 1 ? '' : 's'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedHotspot(hotspot)}
                        className="px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                      >
                        Why?
                      </button>

                      {viewMode === 'files' && onPreviewFile && (
                        <button
                          type="button"
                          onClick={() => onPreviewFile(hotspot.path)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                        >
                          <Eye size={13} aria-hidden="true" />
                          Inspect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Interactive Hotspot Explanation Card / Modal */}
      {selectedHotspot && (
        <HotspotExplanationModal
          hotspot={selectedHotspot}
          onClose={() => setSelectedHotspot(null)}
          onPreviewFile={onPreviewFile}
        />
      )}
    </section>
  );
}

/** Interactive Breakdown Modal explaining exact scoring factors */
function HotspotExplanationModal({ hotspot, onClose, onPreviewFile }) {
  const tier = RISK_TIERS[hotspot.riskLevel] || RISK_TIERS.Low;

  return (
    <div
      role="dialog"
      aria-label={`Hotspot analysis for ${hotspot.path}`}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${tier.bg} ${tier.text} ${tier.border}`}>
                {hotspot.riskLevel} Risk ({hotspot.scores.total} / 100)
              </span>
              <span className="text-[12px] font-mono text-slate-400 uppercase">{hotspot.type}</span>
            </div>
            <h3 className="text-[15px] font-bold font-mono text-slate-900 m-0 break-all">
              {hotspot.path}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close hotspot analysis"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scoring Factor Breakdown */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Hotspot Score Breakdown
          </span>

          <div className="grid grid-cols-1 gap-2 text-[12px]">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex justify-between items-center">
              <div>
                <span className="font-semibold text-slate-800 block">Change Frequency</span>
                <span className="text-slate-500 text-[11px]">{hotspot.changeCount} commits modifying this area</span>
              </div>
              <span className="font-mono font-bold text-blue-700">+{hotspot.scores.freqScore} / 25 pts</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex justify-between items-center">
              <div>
                <span className="font-semibold text-slate-800 block">Code Churn</span>
                <span className="text-slate-500 text-[11px]">{hotspot.churn.toLocaleString()} total additions &amp; deletions</span>
              </div>
              <span className="font-mono font-bold text-blue-700">+{hotspot.scores.churnScore} / 25 pts</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex justify-between items-center">
              <div>
                <span className="font-semibold text-slate-800 block">Modification Recency</span>
                <span className="text-slate-500 text-[11px]">
                  Last changed {hotspot.daysSinceModified <= 0 ? 'today' : `${hotspot.daysSinceModified} days ago`}
                </span>
              </div>
              <span className="font-mono font-bold text-blue-700">+{hotspot.scores.recencyScore} / 25 pts</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex justify-between items-center">
              <div>
                <span className="font-semibold text-slate-800 block">Contributor Concentration</span>
                <span className="text-slate-500 text-[11px]">{hotspot.contributorsCount} distinct active contributors</span>
              </div>
              <span className="font-mono font-bold text-blue-700">+{hotspot.scores.contribScore} / 15 pts</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex justify-between items-center">
              <div>
                <span className="font-semibold text-slate-800 block">AI Risk Signals</span>
                <span className="text-slate-500 text-[11px]">
                  {hotspot.aiInsights.length} matching AI analysis finding{hotspot.aiInsights.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="font-mono font-bold text-purple-700">+{hotspot.scores.aiScore} / 10 pts</span>
            </div>
          </div>
        </div>

        {/* Associated AI Insights */}
        {hotspot.aiInsights.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Matching AI Insights ({hotspot.aiInsights.length})
            </span>
            <div className="space-y-2">
              {hotspot.aiInsights.map((insight, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-purple-50/60 border border-purple-200/80 text-[12px]">
                  <div className="font-bold text-purple-900 mb-1">
                    {insight.category ? insight.category.replace(/_/g, ' ').toUpperCase() : 'AI RISK FINDING'}
                  </div>
                  <p className="text-slate-700 m-0 leading-relaxed">{insight.summary || insight.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
          {hotspot.type === 'file' && onPreviewFile && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onPreviewFile(hotspot.path);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              <Eye size={14} />
              Inspect Code
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HotspotSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-4 gap-3">
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-16 bg-slate-100 rounded-xl" />
      </div>
      <div className="h-24 bg-slate-100 rounded-xl" />
    </div>
  );
}
