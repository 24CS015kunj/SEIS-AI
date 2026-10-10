import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  GitCommit,
  GitPullRequest,
  Layers,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

/**
 * SEIS Quality Gate & Evolution Diagnosis Panel (Milestones 2 & 3).
 *
 * Implements the multi-dimensional Software Quality Score and structured
 * #SEIS-xxx Diagnostic Issues with concrete evidence trails.
 */
export default function QualityGateSection({
  qualityData,
  loading = false,
  onEvaluate,
  onSelectFile,
}) {
  const [expandedIssueId, setExpandedIssueId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedIssueId((prev) => (prev === id ? null : id));
  };

  const getDecisionBadge = (decision) => {
    switch (decision) {
      case 'PASS':
        return {
          icon: ShieldCheck,
          label: 'QUALITY GATE PASSED',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
        };
      case 'WARN':
        return {
          icon: AlertTriangle,
          label: 'QUALITY GATE WARNING',
          bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
        };
      case 'REVIEW_REQUIRED':
        return {
          icon: AlertCircle,
          label: 'HUMAN REVIEW REQUIRED',
          bg: 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
        };
      case 'BLOCK':
      default:
        return {
          icon: ShieldAlert,
          label: 'QUALITY GATE BLOCKED',
          bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
        };
    }
  };

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-rose-500 text-white';
      case 'HIGH':
        return 'bg-amber-500 text-white';
      case 'MEDIUM':
        return 'bg-blue-600 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 65) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const decisionInfo = getDecisionBadge(qualityData?.decision || 'WARN');
  const DecisionIcon = decisionInfo.icon;
  const issues = qualityData?.issues || [];

  return (
    <section
      aria-label="SEIS Software Quality Gate & Evolution Diagnosis"
      className="apple-card rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm overflow-hidden flex flex-col"
    >
      {/* Top Banner Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/80 via-white to-blue-50/30 dark:from-[#0B0F19] dark:via-[#111827] dark:to-blue-950/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Cpu size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-slate-100 m-0 tracking-tight">
                SEIS Quality Gate &amp; Evolution Diagnosis
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                AI Gate v1
              </span>
            </div>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 m-0 mt-0.5">
              Multi-dimensional evaluation: architecture layering, git churn velocity, and structured issue diagnosis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          {onEvaluate && (
            <button
              type="button"
              onClick={onEvaluate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Analyzing…' : 'Re-evaluate Gate'}</span>
            </button>
          )}

          {qualityData && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold font-mono ${decisionInfo.bg}`}>
              <DecisionIcon size={14} />
              <span>{decisionInfo.label}</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 m-0">
            Parsing source code, calculating coupling topologies &amp; evaluating commit churn history…
          </p>
        </div>
      ) : !qualityData ? (
        <div className="p-10 text-center flex flex-col items-center justify-center gap-2.5">
          <Cpu size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-[13px] text-slate-500 dark:text-slate-400 m-0">
            Click <strong>Re-evaluate Gate</strong> to compute multi-dimensional quality scores and generate structured SEIS diagnosis cards.
          </p>
        </div>
      ) : (
        <div className="p-5 flex flex-col gap-6">
          {/* Multi-Dimensional Scores Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0B0F19] flex flex-col justify-between">
              <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Overall Quality
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[28px] font-bold font-mono tracking-tight ${getScoreColor(qualityData.overallScore)}`}>
                  {qualityData.overallScore}
                </span>
                <span className="text-[12px] text-slate-400 font-mono">/ 100</span>
              </div>
              <p className="text-[11px] text-slate-500 m-0 mt-1 leading-snug">
                Composite software quality index
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0B0F19] flex flex-col justify-between">
              <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Architecture Compliance
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[28px] font-bold font-mono tracking-tight ${getScoreColor(qualityData.architectureScore)}`}>
                  {qualityData.architectureScore}
                </span>
                <span className="text-[12px] text-slate-400 font-mono">/ 100</span>
              </div>
              <p className="text-[11px] text-slate-500 m-0 mt-1 leading-snug">
                Layer boundaries &amp; coupling stability
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0B0F19] flex flex-col justify-between">
              <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Maintainability
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[28px] font-bold font-mono tracking-tight ${getScoreColor(qualityData.maintainabilityScore)}`}>
                  {qualityData.maintainabilityScore}
                </span>
                <span className="text-[12px] text-slate-400 font-mono">/ 100</span>
              </div>
              <p className="text-[11px] text-slate-500 m-0 mt-1 leading-snug">
                Branch complexity &amp; method sizing
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0B0F19] flex flex-col justify-between">
              <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Evolution Stability
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[28px] font-bold font-mono tracking-tight ${getScoreColor(qualityData.evolutionRiskScore)}`}>
                  {qualityData.evolutionRiskScore}
                </span>
                <span className="text-[12px] text-slate-400 font-mono">/ 100</span>
              </div>
              <p className="text-[11px] text-slate-500 m-0 mt-1 leading-snug">
                Resistance to churn &amp; regressions
              </p>
            </div>
          </div>

          {/* Diagnosis Issues List Header */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-slate-800 dark:text-slate-100 m-0">
                Structured Diagnostic Issues
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {issues.length} {issues.length === 1 ? 'finding' : 'findings'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Principle: Conservative modification, aggressive explanation
            </span>
          </div>

          {/* Issues List */}
          {issues.length === 0 ? (
            <div className="p-6 rounded-xl border border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20 text-center">
              <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-1.5" />
              <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300 m-0">
                Zero High-Risk Architectural or Evolution Violations Detected
              </p>
              <p className="text-[11.5px] text-emerald-700/80 dark:text-emerald-400/80 m-0 mt-0.5">
                SEIS determined existing components meet quality standards. No modification proposed.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {issues.map((issue) => {
                const isExpanded = expandedIssueId === issue.issueId;

                return (
                  <div
                    key={issue.issueId}
                    className="border border-slate-200/90 dark:border-slate-800 rounded-xl bg-white dark:bg-[#111827] overflow-hidden transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
                  >
                    {/* Collapsed Header Bar */}
                    <div
                      onClick={() => toggleExpand(issue.issueId)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none bg-slate-50/40 hover:bg-slate-50 dark:bg-[#0B0F19]/40 dark:hover:bg-[#0B0F19]"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold tracking-wider shrink-0 ${getSeverityBadge(issue.severity)}`}>
                          {issue.severity}
                        </span>

                        <span className="font-mono text-[12px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
                          #{issue.issueId}
                        </span>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectFile) onSelectFile(issue.targetPath);
                            }}
                            className="text-[13px] font-mono font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                            title="Click to view file"
                          >
                            {issue.targetPath}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 self-start sm:self-auto">
                            {issue.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">
                          Confidence: {Math.round(issue.confidence * 100)}%
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* Problem Preview */}
                    <div className="px-4 py-2.5 text-[12.5px] text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#111827]">
                      {issue.problem}
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0B0F19]/60 flex flex-col gap-4">
                        {/* Quantitative Evidence Badges */}
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-2">
                            Quantitative Evidence Trail
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 text-center">
                              <span className="text-[10px] text-slate-400 block">Lines of Code</span>
                              <span className="text-[14px] font-bold font-mono text-slate-800 dark:text-slate-200">
                                {issue.evidence?.lines ?? '—'}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 text-center">
                              <span className="text-[10px] text-slate-400 block">Churn (90d)</span>
                              <span className="text-[14px] font-bold font-mono text-slate-800 dark:text-slate-200">
                                {issue.evidence?.churn_count ?? 0} commits
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 text-center">
                              <span className="text-[10px] text-slate-400 block">Bug Fixes</span>
                              <span className="text-[14px] font-bold font-mono text-rose-600 dark:text-rose-400">
                                {issue.evidence?.bug_fix_count ?? 0}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 text-center">
                              <span className="text-[10px] text-slate-400 block">Callers (Fan-In)</span>
                              <span className="text-[14px] font-bold font-mono text-blue-600 dark:text-blue-400">
                                {issue.evidence?.fan_in ?? 0}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 text-center">
                              <span className="text-[10px] text-slate-400 block">Complexity</span>
                              <span className="text-[14px] font-bold font-mono text-amber-600 dark:text-amber-400">
                                {issue.evidence?.cyclomatic_complexity ?? 1}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Evolution Context Narrative */}
                        {issue.evolution_evidence && (
                          <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800 text-[12px] text-amber-900 dark:text-amber-200">
                            <span className="font-bold block mb-0.5">Evolution Intelligence:</span>
                            {issue.evolution_evidence}
                          </div>
                        )}

                        {/* Concrete Recommendation */}
                        <div className="p-3.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800">
                          <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 block mb-1">
                            SEIS Recommendation
                          </span>
                          <p className="text-[12.5px] text-blue-900 dark:text-blue-200 m-0 leading-relaxed">
                            {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
