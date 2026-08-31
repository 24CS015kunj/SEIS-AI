import React, { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Flame, AlertOctagon, AlertTriangle, Info } from 'lucide-react';

/**
 * Task 92: Repository Health Score card.
 *
 * Computed purely from `analysis` (the already-fetched AI Insights payload —
 * Task 69/74's real `RepositoryAnalysisService` output):
 *
 *   Base score = 100
 *   −15 per CRITICAL insight
 *   −8  per MAJOR insight
 *   −3  per MINOR insight
 *   −0.5 per hotspot-score point above 75 (max −15, capped at 5 hotspots)
 *   Floor: 0; Cap: 100
 *
 * This is a presentation transform on real backend data — not a new metric,
 * not a fabricated number, not an LLM output. Every deduction traces back to
 * a real `EngineeringInsight` or `HotspotMetrics` record the FastAPI
 * EvolutionAnalysisService produced.
 *
 * Props:
 *   status   — 'loading' | 'none' | 'ready' | 'error'
 *   analysis — the full analysis object (Task 74 shape)
 */
export default function RepositoryHealthCard({ status, analysis }) {
  const computed = useMemo(() => {
    if (status !== 'ready' || !analysis) return null;
    return computeHealthScore(analysis);
  }, [status, analysis]);

  if (status === 'loading') return null; // Don't block dashboard render
  if (status === 'none' || status === 'error' || !computed) return null;

  const { score, tier, deductions, criticalCount, majorCount, minorCount, hotspotPenalty } = computed;

  return (
    <div
      id="health-score-card"
      className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-4 flex items-center gap-5"
      aria-label={`Repository health score: ${score} out of 100`}
    >
      {/* Gauge ring */}
      <ScoreRing score={score} tier={tier} />

      {/* Text side */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <TierIcon tier={tier} />
          <span className="text-[13.5px] font-bold text-slate-900">Repository Health</span>
          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tier.badge}`}
          >
            {tier.label}
          </span>
        </div>

        <p className="text-[12px] text-slate-500 m-0 mb-2 leading-snug">{tier.description}</p>

        {/* Deduction breakdown — only shown if there are any */}
        {deductions.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {criticalCount > 0 && (
              <DeductionChip
                icon={AlertOctagon}
                color="text-rose-600"
                label={`${criticalCount} critical finding${criticalCount > 1 ? 's' : ''}`}
              />
            )}
            {majorCount > 0 && (
              <DeductionChip
                icon={AlertTriangle}
                color="text-amber-600"
                label={`${majorCount} major finding${majorCount > 1 ? 's' : ''}`}
              />
            )}
            {minorCount > 0 && (
              <DeductionChip
                icon={Info}
                color="text-blue-500"
                label={`${minorCount} minor finding${minorCount > 1 ? 's' : ''}`}
              />
            )}
            {hotspotPenalty > 0 && (
              <DeductionChip
                icon={Flame}
                color="text-orange-500"
                label="High-churn hotspots"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score computation ───────────────────────────────────────────────────────

function computeHealthScore(analysis) {
  const insights = analysis.insights ?? [];
  const hotspots = analysis.hotspots ?? [];

  let score = 100;
  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;
  const deductions = [];

  for (const insight of insights) {
    if (insight.severity === 'critical') { score -= 15; criticalCount++; }
    else if (insight.severity === 'major')  { score -= 8;  majorCount++;  }
    else if (insight.severity === 'minor')  { score -= 3;  minorCount++;  }
  }

  // Cap hotspot penalty: top-5 hotspots with score > 75 each deduct proportionally
  let hotspotPenalty = 0;
  const highHotspots = [...hotspots]
    .sort((a, b) => b.hotspot_score - a.hotspot_score)
    .slice(0, 5)
    .filter((h) => h.hotspot_score > 75);

  for (const h of highHotspots) {
    hotspotPenalty += (h.hotspot_score - 75) * 0.5;
  }
  hotspotPenalty = Math.min(hotspotPenalty, 15);
  score -= hotspotPenalty;

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (criticalCount > 0) deductions.push('critical');
  if (majorCount > 0)    deductions.push('major');
  if (minorCount > 0)    deductions.push('minor');
  if (hotspotPenalty > 0) deductions.push('hotspot');

  return {
    score,
    tier: scoreTier(score),
    deductions,
    criticalCount,
    majorCount,
    minorCount,
    hotspotPenalty,
  };
}

function scoreTier(score) {
  if (score >= 85) return {
    label: 'Healthy',
    description: 'No significant risk factors detected in the latest analysis.',
    ring: '#22c55e',  // green-500
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: 'green',
  };
  if (score >= 65) return {
    label: 'Fair',
    description: 'Some risk factors present — review flagged findings below.',
    ring: '#f59e0b',  // amber-500
    badge: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: 'amber',
  };
  return {
    label: 'Needs Attention',
    description: 'Multiple high-severity findings require action.',
    ring: '#ef4444',  // red-500
    badge: 'text-rose-700 bg-rose-50 border-rose-200',
    icon: 'red',
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreRing({ score, tier }) {
  const SIZE = 64;
  const STROKE = 5;
  const R = (SIZE - STROKE * 2) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const offset = CIRCUMFERENCE * (1 - score / 100);

  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={STROKE}
        />
        {/* Progress */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={tier.ring}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums"
        style={{ color: tier.ring }}
      >
        {score}
      </span>
    </div>
  );
}

function TierIcon({ tier }) {
  const className = 'shrink-0';
  if (tier.icon === 'green') return <ShieldCheck size={15} className={`text-emerald-600 ${className}`} aria-hidden="true" />;
  if (tier.icon === 'amber') return <ShieldAlert size={15} className={`text-amber-600 ${className}`} aria-hidden="true" />;
  return <ShieldX size={15} className={`text-rose-600 ${className}`} aria-hidden="true" />;
}

function DeductionChip({ icon: Icon, color, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
