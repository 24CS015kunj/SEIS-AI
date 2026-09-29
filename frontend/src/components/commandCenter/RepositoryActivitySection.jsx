import React, { useMemo, useState } from 'react';
import { Activity, BarChart2, FolderGit2, Info, TrendingDown, TrendingUp, Users, Zap } from 'lucide-react';
import { calculateActivityAnalytics } from '../../utils/activityAnalytics';

/**
 * Task: Production-quality engineering activity visualization upgrade.
 * Modes: Activity (commits), Code Churn (additions+deletions), Net Change, Additions, Deletions.
 * Features SVG crosshairs, dual focus ring, anomaly detection, active author counts, and 4-column highlights.
 * 100% real GitHub data, zero mock/fake data.
 */
export default function RepositoryActivitySection({ commits, dashboardData, loading }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [metric, setMetric] = useState('activity'); // 'activity' | 'churn' | 'net' | 'additions' | 'deletions'

  const analytics = useMemo(() => {
    return calculateActivityAnalytics(commits, dashboardData, rangeDays);
  }, [commits, dashboardData, rangeDays]);

  const activeMetricDisplay = useMemo(() => {
    const hasStats = analytics.codeChanges?.hasStats;
    if (metric === 'churn') {
      const churnVal = hasStats
        ? (analytics.codeChanges.totalAdditions + analytics.codeChanges.totalDeletions).toLocaleString()
        : 'Not available';
      return {
        label: `Code Churn (${rangeDays} Days)`,
        value: hasStats ? `${churnVal}` : 'Not available',
        unit: 'lines churned',
        colorClass: 'text-blue-700',
      };
    }
    if (metric === 'net') {
      const netVal = analytics.codeChanges?.netChange ?? 0;
      const formattedNet = netVal >= 0 ? `+${netVal.toLocaleString()}` : netVal.toLocaleString();
      return {
        label: `Net Code Change (${rangeDays} Days)`,
        value: hasStats ? formattedNet : 'Not available',
        unit: 'net lines',
        colorClass: netVal >= 0 ? 'text-slate-900' : 'text-rose-600',
      };
    }
    if (metric === 'additions') {
      return {
        label: `Code Additions (${rangeDays} Days)`,
        value: hasStats
          ? `+${analytics.codeChanges.totalAdditions.toLocaleString()}`
          : 'Not available',
        unit: 'lines added',
        colorClass: 'text-emerald-600',
      };
    }
    if (metric === 'deletions') {
      return {
        label: `Code Deletions (${rangeDays} Days)`,
        value: hasStats
          ? `-${analytics.codeChanges.totalDeletions.toLocaleString()}`
          : 'Not available',
        unit: 'lines deleted',
        colorClass: 'text-rose-600',
      };
    }
    // Default: 'activity'
    return {
      label: `Commit Activity (${rangeDays} Days)`,
      value: (analytics.totalCommits ?? 0).toLocaleString(),
      unit: 'commits',
      colorClass: 'text-slate-900',
    };
  }, [metric, rangeDays, analytics]);

  const peakDisplay = useMemo(() => {
    const h = analytics.highlights;
    if (!h) return 'N/A';
    if (metric === 'additions') {
      return `+${h.peakBucketAdditions.toLocaleString()} lines · ${h.peakBucketDate}`;
    }
    if (metric === 'deletions') {
      return `-${h.peakBucketDeletions.toLocaleString()} lines · ${h.peakBucketDate}`;
    }
    if (metric === 'churn') {
      const peakChurn = h.peakBucketAdditions + h.peakBucketDeletions;
      return `${peakChurn.toLocaleString()} lines · ${h.peakBucketDate}`;
    }
    return `${h.peakBucketCount} commit${h.peakBucketCount === 1 ? '' : 's'} · ${h.peakBucketDate}`;
  }, [metric, analytics.highlights]);

  return (
    <section
      role="region"
      aria-label="Repository Activity and Contribution Insights"
      className="apple-card p-5 rounded-xl border border-slate-200/90 bg-white shadow-xs flex flex-col gap-4"
    >
      {/* Header & Date Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
            <Activity size={14} aria-hidden="true" />
          </span>
          <h2 className="text-[13.5px] font-semibold text-slate-800 m-0">
            Repository Activity &amp; Contribution Insights
          </h2>
        </div>

        {/* Date Range Selector */}
        <div
          role="group"
          aria-label="Select date range for activity analytics"
          className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 self-start sm:self-auto shrink-0"
        >
          {[7, 30, 90].map((days) => {
            const isSelected = rangeDays === days;
            return (
              <button
                key={days}
                type="button"
                id={`activity-range-${days}d`}
                onClick={() => setRangeDays(days)}
                aria-pressed={isSelected}
                className={`px-2.5 py-1 text-[11.5px] font-mono font-medium rounded-md transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {days}D
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <ActivitySkeleton />
      ) : !analytics.available ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200/80 rounded-xl">
          <p className="text-[12.5px] font-mono text-slate-500 m-0">{analytics.reason}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {analytics.isLimitedHistory && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200/80 text-[12px] font-mono text-blue-700">
              <Info size={14} className="text-blue-600 shrink-0" aria-hidden="true" />
              <span>{analytics.historyBannerMessage}</span>
            </div>
          )}

          {/* Top Row: Chart Card + Activity Health Card */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-stretch">
            {/* Advanced Engineering Chart Card */}
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              {/* Metric Mode Switcher Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-200/60">
                <div>
                  <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500 block mb-0.5">
                    {activeMetricDisplay.label}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[22px] font-bold font-mono tracking-tight ${activeMetricDisplay.colorClass}`}>
                      {activeMetricDisplay.value}
                    </span>
                    <span className="text-[12px] font-mono text-slate-500">{activeMetricDisplay.unit}</span>

                    {/* Trend Indicator Badge (inline next to value) */}
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-medium border ${
                        analytics.trendState === 'up'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : analytics.trendState === 'down'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : analytics.trendState === 'new_activity'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : analytics.trendState === 'limited'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                      title={analytics.trendDescription}
                    >
                      {analytics.trendState === 'up' && (
                        <TrendingUp size={11} aria-hidden="true" />
                      )}
                      {analytics.trendState === 'down' && (
                        <TrendingDown size={11} aria-hidden="true" />
                      )}
                      <span>{analytics.trendLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Mode Switcher Buttons */}
                <div
                  role="group"
                  aria-label="Select chart mode"
                  className="inline-flex items-center rounded-lg bg-white p-0.5 border border-slate-200/90 shadow-2xs self-start sm:self-auto shrink-0 flex-wrap gap-0.5"
                >
                  {[
                    { key: 'activity', label: 'Activity' },
                    { key: 'churn', label: 'Code Churn' },
                    { key: 'net', label: 'Net Change' },
                    { key: 'additions', label: 'Additions' },
                    { key: 'deletions', label: 'Deletions' },
                  ].map((m) => {
                    const isSelected = metric === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        id={`metric-toggle-${m.key}`}
                        onClick={() => setMetric(m.key)}
                        aria-pressed={isSelected}
                        className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded-md transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced SVG Area Chart with Crosshairs */}
              <div className="relative">
                <ActivityAreaChart
                  buckets={analytics.buckets}
                  metric={metric}
                  rangeDays={rangeDays}
                />
                {analytics.highlights.totalCommitsCount === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[11px] font-mono text-slate-500 bg-white/90 border border-slate-200/80 px-2.5 py-1 rounded-md shadow-2xs">
                      No commit activity recorded in this period
                    </span>
                  </div>
                )}
              </div>

              {/* 4-Column Engineering Summary Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-200/80 text-[11px]">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                    Peak Activity
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-slate-800 truncate block" title={peakDisplay}>
                    {peakDisplay}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                    Average Rate
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-slate-800 block">
                    ~{analytics.highlights.avgCommitsPerDay} commits/day
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                    Active Period
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-slate-800 block">
                    {analytics.highlights.activeDaysCount} / {analytics.highlights.totalDaysCount} {analytics.highlights.unitLabel}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
                    Net Code Change
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-slate-800 block">
                    {analytics.codeChanges.hasStats
                      ? `${analytics.codeChanges.netChange >= 0 ? '+' : ''}${analytics.codeChanges.netChange.toLocaleString()} lines`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Activity Health Card with Mini Visual Meters */}
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Activity Health Indicator
                </span>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[26px] font-bold font-mono text-blue-600">
                    {analytics.health.score}
                  </span>
                  <span className="text-[12px] font-mono text-slate-400">/ 100</span>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[10.5px] font-mono font-semibold ml-auto">
                    {analytics.health.label}
                  </span>
                </div>

                {/* Overall Score Progress Bar */}
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(4, analytics.health.score))}%` }}
                  />
                </div>
              </div>

              {/* Sub-score Breakdown with Mini Visual Bars */}
              <div className="space-y-2 text-[11px] font-mono border-t border-slate-200/80 pt-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Recency Score</span>
                    <span className="font-semibold text-slate-800">
                      {analytics.health.recencyScore} / 40 pts
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (analytics.health.recencyScore / 40) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Consistency Ratio</span>
                    <span className="font-semibold text-slate-800">
                      {analytics.health.consistencyScore} / 30 pts
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (analytics.health.consistencyScore / 30) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Author Diversity</span>
                    <span className="font-semibold text-slate-800">
                      {analytics.health.diversityScore} / 30 pts
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (analytics.health.diversityScore / 30) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-[10px] font-mono text-slate-400 mt-3 m-0 leading-tight border-t border-slate-200/60 pt-2">
                Calculated strictly from real commit timestamps, frequency, and author count.
              </p>
            </div>
          </div>

          {/* Bottom Grid: Contributors, Code Changes, Active Areas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top Contributors Card */}
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3 justify-between">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
                      <Users size={12} aria-hidden="true" />
                    </span>
                    <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      Top Contributors
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200/80">
                    {analytics.totalContributorsCount}
                  </span>
                </div>

                {analytics.topContributors.length === 0 ? (
                  <p className="text-[12px] font-mono text-slate-400 m-0">No contributor data available.</p>
                ) : (
                  <div className="space-y-2.5">
                    {analytics.topContributors.map((c) => (
                      <div key={c.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="font-semibold text-slate-800 truncate" title={c.name}>
                            {c.name}
                          </span>
                          <span className="font-mono text-slate-500 text-[10.5px] shrink-0 ml-2">
                            {c.commits} commit{c.commits === 1 ? '' : 's'} ({c.sharePercent}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(4, c.sharePercent)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Code Changes Card */}
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3 justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="w-5 h-5 rounded bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
                    <BarChart2 size={12} aria-hidden="true" />
                  </span>
                  <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Code Changes
                  </span>
                </div>

                {!analytics.codeChanges.hasStats ? (
                  <p className="text-[12px] font-mono text-slate-400 m-0">
                    Statistics not available for commits in this date range.
                  </p>
                ) : (
                  <div className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-600">Total Additions</span>
                      <span className="font-bold text-emerald-600">
                        +{analytics.codeChanges.totalAdditions.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-600">Total Deletions</span>
                      <span className="font-bold text-rose-600">
                        -{analytics.codeChanges.totalDeletions.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono pt-1.5 border-t border-slate-200/80">
                      <span className="text-slate-700 font-semibold">Net Change</span>
                      <span className="font-bold text-slate-900">
                        {analytics.codeChanges.netChange >= 0
                          ? `+${analytics.codeChanges.netChange.toLocaleString()}`
                          : analytics.codeChanges.netChange.toLocaleString()}
                      </span>
                    </div>
                    {analytics.codeChanges.avgChangesPerCommit != null && (
                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 pt-1">
                        <span>Avg / Commit</span>
                        <span>~{analytics.codeChanges.avgChangesPerCommit} lines</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Most Active Areas Card */}
            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-3 justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="w-5 h-5 rounded bg-blue-50 text-[#0071E3] flex items-center justify-center shrink-0">
                    <FolderGit2 size={12} aria-hidden="true" />
                  </span>
                  <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    Active Directories
                  </span>
                </div>

                {analytics.activeAreas.length === 0 ? (
                  <p className="text-[12px] font-mono text-slate-400 m-0">No active directory data available.</p>
                ) : (
                  <div className="space-y-1.5 text-[11.5px]">
                    {analytics.activeAreas.map((area) => (
                      <div
                        key={area.dir}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200/90 shadow-2xs"
                      >
                        <span className="font-mono text-slate-800 truncate" title={area.dir}>
                          {area.dir}
                        </span>
                        <span className="font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded text-[10.5px] shrink-0">
                          {area.count} {area.count === 1 ? 'change' : 'changes'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Professional SVG Area & Line Chart with Interactive Crosshairs & Anomaly Markers */
function ActivityAreaChart({ buckets, metric, rangeDays }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Chart dimensions & padding
  const width = 600;
  const height = 170;
  const padLeft = 35;
  const padRight = 15;
  const padTop = 22;
  const padBottom = 30;

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  // Calculate scaled max value
  const maxY = useMemo(() => {
    const rawMax = Math.max(
      1,
      ...buckets.map((b) => {
        if (metric === 'churn') return b.churn || 0;
        if (metric === 'net') return Math.abs(b.netChange || 0);
        if (metric === 'additions') return b.additions || 0;
        if (metric === 'deletions') return b.deletions || 0;
        return b.count || 0;
      })
    );
    return Math.ceil(rawMax * 1.15); // 15% headroom above peak point
  }, [buckets, metric]);

  // Points coordinates
  const points = useMemo(() => {
    const count = buckets.length;
    return buckets.map((b, i) => {
      let val = b.count || 0;
      if (metric === 'churn') val = b.churn || 0;
      else if (metric === 'net') val = b.netChange || 0;
      else if (metric === 'additions') val = b.additions || 0;
      else if (metric === 'deletions') val = b.deletions || 0;

      const x = count === 1 ? padLeft + innerW / 2 : padLeft + (i / (count - 1)) * innerW;

      // Scaling: net change can be positive or negative
      let y = padTop + innerH - (val / maxY) * innerH;
      if (metric === 'net') {
        const midY = padTop + innerH / 2;
        y = midY - (val / (maxY * 2)) * innerH;
      }

      return { x, y, val, bucket: b, index: i };
    });
  }, [buckets, metric, maxY, innerW, innerH, padLeft, padTop]);

  // Find peak point for subtle visual highlight annotation
  const peakPoint = useMemo(() => {
    if (points.length === 0) return null;
    let maxP = points[0];
    for (const p of points) {
      if (p.val > maxP.val) maxP = p;
    }
    return maxP.val > 0 ? maxP : null;
  }, [points]);

  // SVG Area path (closed polygon under curve)
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const lineCoords = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
    const firstX = points[0].x.toFixed(1);
    const lastX = points[points.length - 1].x.toFixed(1);
    const bottomY = metric === 'net' ? (padTop + innerH / 2).toFixed(1) : (padTop + innerH).toFixed(1);
    return `M ${firstX},${bottomY} L ${lineCoords} L ${lastX},${bottomY} Z`;
  }, [points, metric, padTop, innerH]);

  // SVG Line path
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return 'M ' + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
  }, [points]);

  // Non-overlapping X-axis labels filter
  const visibleXLabels = useMemo(() => {
    const total = points.length;
    if (total <= 7) return points; // 7D: show all

    if (rangeDays === 30) {
      // 30D: show label approx every 5th day
      const step = Math.ceil(total / 6);
      return points.filter((_, i) => i % step === 0 || i === total - 1);
    }

    // 90D: show label approx every 3rd week
    const step = Math.ceil(total / 5);
    return points.filter((_, i) => i % step === 0 || i === total - 1);
  }, [points, rangeDays]);

  const activePoint = hoveredIdx != null ? points[hoveredIdx] : null;

  return (
    <div className="w-full relative select-none">
      <div className="relative w-full aspect-[600/170]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          role="img"
          aria-label={`Engineering activity line chart plotting ${metric}`}
        >
          <defs>
            <linearGradient id="activityAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Solid Zero Baseline */}
          <line
            x1={padLeft}
            y1={metric === 'net' ? padTop + innerH / 2 : padTop + innerH}
            x2={width - padRight}
            y2={metric === 'net' ? padTop + innerH / 2 : padTop + innerH}
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />

          {/* Y-Axis Horizontal Grid Lines */}
          {[0.5, 1].map((ratio, idx) => {
            const yPos = padTop + innerH - ratio * innerH;
            const valLabel = Math.round(ratio * maxY);
            const formattedVal =
              valLabel >= 1000 ? `${(valLabel / 1000).toFixed(1)}k` : String(valLabel);

            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={yPos}
                  x2={width - padRight}
                  y2={yPos}
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={yPos + 3}
                  textAnchor="end"
                  className="text-[9.5px] font-mono fill-slate-400"
                >
                  {formattedVal}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill="url(#activityAreaGradient)" />}

          {/* Polyline */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#2563EB"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Subtle Peak Point Annotation Callout */}
          {peakPoint && hoveredIdx == null && (
            <g>
              <circle
                cx={peakPoint.x}
                cy={peakPoint.y}
                r="7"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="1.5"
                className="animate-pulse"
              />
              <text
                x={peakPoint.x}
                y={Math.max(12, peakPoint.y - 10)}
                textAnchor="middle"
                className="text-[9px] font-mono font-bold fill-blue-700"
              >
                Peak: {peakPoint.val}
              </text>
            </g>
          )}

          {/* Interactive Dual Crosshairs (Vertical + Horizontal) */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={padTop + innerH}
                stroke="#3B82F6"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <line
                x1={padLeft}
                y1={activePoint.y}
                x2={width - padRight}
                y2={activePoint.y}
                stroke="#93C5FD"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </g>
          )}

          {/* Data Points */}
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx;
            const isZero = p.val === 0;
            const isAnomaly = p.bucket.isAnomaly;

            return (
              <g
                key={idx}
                tabIndex={0}
                role="button"
                aria-label={`${p.bucket.formattedDate}: ${p.val} ${metric}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
                className="cursor-pointer focus:outline-none"
              >
                {/* Transparent hit target */}
                <circle cx={p.x} cy={p.y} r={12} fill="transparent" />

                {/* Anomaly Outer Highlight Badge */}
                {isAnomaly && !isHovered && (
                  <circle cx={p.x} cy={p.y} r={6} fill="none" stroke="#F59E0B" strokeWidth="1.5" />
                )}

                {/* Active Hover Dual Glow Ring */}
                {isHovered && (
                  <>
                    <circle cx={p.x} cy={p.y} r={10} fill="#93C5FD" opacity="0.4" />
                    <circle cx={p.x} cy={p.y} r={6} fill="#1D4ED8" stroke="#FFFFFF" strokeWidth="2" />
                  </>
                )}

                {/* Normal Data Point Dot */}
                {!isHovered && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isZero ? 2 : 3.5}
                    opacity={isZero ? 0.4 : 1}
                    fill={isAnomaly ? '#F59E0B' : '#2563EB'}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    className="transition-all duration-150"
                  />
                )}
              </g>
            );
          })}

          {/* X-Axis Non-Overlapping Labels */}
          {visibleXLabels.map((p, idx) => (
            <text
              key={idx}
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              className="text-[10px] font-mono fill-slate-400"
            >
              {p.bucket.label}
            </text>
          ))}
        </svg>

        {/* Polished Rich Tooltip Card */}
        {activePoint && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 text-white rounded-lg shadow-xl px-3 py-2 text-[11px] font-mono border border-slate-700 transition-all duration-100"
            style={{
              left: `${Math.max(10, Math.min(85, (activePoint.x / width) * 100))}%`,
              top: `${Math.max(5, ((activePoint.y - 85) / height) * 100)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex items-center justify-between gap-3 font-semibold text-blue-300 border-b border-slate-700 pb-1 mb-1">
              <span>{activePoint.bucket.formattedDate}</span>
              {activePoint.bucket.isAnomaly && (
                <span className="flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-400/30">
                  <Zap size={10} aria-hidden="true" />
                  <span>High Activity</span>
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-300">Commits:</span>
                <span className="font-bold text-white">{activePoint.bucket.count}</span>
              </div>
              {activePoint.bucket.hasStats && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-300">Additions:</span>
                    <span className="text-emerald-400 font-bold">
                      +{activePoint.bucket.additions.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-300">Deletions:</span>
                    <span className="text-rose-400 font-bold">
                      -{activePoint.bucket.deletions.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 border-t border-slate-800">
                    <span className="text-slate-300">Net Change:</span>
                    <span className="text-blue-200 font-bold">
                      {activePoint.bucket.netChange >= 0
                        ? `+${activePoint.bucket.netChange.toLocaleString()}`
                        : activePoint.bucket.netChange.toLocaleString()}
                    </span>
                  </div>
                </>
              )}
              {activePoint.bucket.activeAuthorsCount > 0 && (
                <div className="flex justify-between gap-4 pt-0.5 text-slate-400 text-[10px]">
                  <span>Contributors:</span>
                  <span>{activePoint.bucket.activeAuthorsCount} author{activePoint.bucket.activeAuthorsCount === 1 ? '' : 's'}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-44 bg-slate-100 rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 bg-slate-100 rounded-xl" />
        <div className="h-24 bg-slate-100 rounded-xl" />
        <div className="h-24 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}
