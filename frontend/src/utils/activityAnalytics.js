/**
 * Utility to calculate real repository activity & contribution insights
 * from authenticated GitHub commit & dashboard data.
 * Zero mock, fake, hardcoded, or random data.
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calculateActivityAnalytics(commits = [], dashboardData = null, rangeDays = 30) {
  if (!commits || commits.length === 0) {
    return {
      available: false,
      reason: 'No synced commits available for this repository.',
    };
  }

  const now = Date.now();
  const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
  const cutoffTime = now - rangeMs;

  // Filter commits within the date range
  const filteredCommits = commits.filter((c) => {
    const time = new Date(c.committedAtRaw || c.committedAt).getTime();
    return !Number.isNaN(time) && time >= cutoffTime;
  });

  // Calculate actual timespan covered by available commits
  const timestamps = commits
    .map((c) => new Date(c.committedAtRaw || c.committedAt).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const oldestTime = timestamps.length > 0 ? timestamps[0] : now;
  const newestTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : now;
  const totalCoveredDays = Math.max(1, Math.ceil((now - oldestTime) / (1000 * 60 * 60 * 24)));

  const isLimitedHistory = totalCoveredDays < rangeDays;

  // 1. Commit Activity Buckets (Daily for 7D/30D, Weekly for 90D)
  const isWeekly = rangeDays > 30;
  const bucketCount = isWeekly ? Math.ceil(rangeDays / 7) : rangeDays;
  const bucketDurationMs = isWeekly ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const end = now - i * bucketDurationMs;
    const start = end - bucketDurationMs;
    const dateObj = new Date(end);

    const monthStr = MONTH_NAMES[dateObj.getMonth()];
    const dayNum = dateObj.getDate();
    const dayName = DAY_NAMES[dateObj.getDay()];

    let label = '';
    let formattedDate = '';

    if (rangeDays === 7) {
      label = dayName;
      formattedDate = `${dayName}, ${monthStr} ${dayNum}`;
    } else if (rangeDays === 30) {
      label = `${monthStr} ${dayNum}`;
      formattedDate = `${monthStr} ${dayNum}`;
    } else {
      label = `W${bucketCount - i}`;
      const startDateObj = new Date(start);
      formattedDate = `${MONTH_NAMES[startDateObj.getMonth()]} ${startDateObj.getDate()} – ${monthStr} ${dayNum}`;
    }

    return {
      index: bucketCount - 1 - i,
      label,
      formattedDate,
      start,
      end,
      count: 0,
      additions: 0,
      deletions: 0,
      statsCount: 0,
      authorSet: new Set(),
    };
  }).reverse();

  // Populate bucket metrics from real filtered commits
  for (const commit of filteredCommits) {
    const time = new Date(commit.committedAtRaw || commit.committedAt).getTime();
    const bucket = buckets.find((b) => time >= b.start && time < b.end);
    if (bucket) {
      bucket.count += 1;
      const authorName = commit.author?.name || commit.author?.username || commit.actor;
      if (authorName) bucket.authorSet.add(authorName);

      if (commit.additions != null && commit.deletions != null) {
        bucket.additions += commit.additions;
        bucket.deletions += commit.deletions;
        bucket.statsCount += 1;
      }
    }
  }

  // Calculate per-bucket net change, active authors, and churn
  buckets.forEach((b) => {
    b.netChange = b.additions - b.deletions;
    b.churn = b.additions + b.deletions;
    b.hasStats = b.statsCount > 0;
    b.activeAuthorsCount = b.authorSet.size;
  });

  /**
   * Activity Anomaly Detection Formula:
   * A bucket is flagged as a statistical activity anomaly if its commit count
   * exceeds (mean + 2 * stdDev) of all non-zero buckets AND is at least 3 commits.
   */
  const nonZeroCounts = buckets.map((b) => b.count).filter((c) => c > 0);
  if (nonZeroCounts.length >= 2) {
    const mean = nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length;
    const variance = nonZeroCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nonZeroCounts.length;
    const stdDev = Math.sqrt(variance);
    const anomalyThreshold = Math.max(3, mean + 2 * stdDev);

    buckets.forEach((b) => {
      b.isAnomaly = b.count >= anomalyThreshold;
    });
  } else {
    buckets.forEach((b) => {
      b.isAnomaly = false;
    });
  }

  // --- Robust Trend Analysis & Comparison Logic ---
  const midPoint = now - rangeMs / 2;
  const recentCount = filteredCommits.filter(
    (c) => new Date(c.committedAtRaw || c.committedAt).getTime() >= midPoint
  ).length;

  const previousCount = filteredCommits.filter((c) => {
    const t = new Date(c.committedAtRaw || c.committedAt).getTime();
    return t < midPoint && t >= cutoffTime;
  }).length;

  let trendState = 'steady';
  let trendPercent = null;
  let trendLabel = 'No change';
  let trendDescription = `vs previous ${rangeDays} days`;

  const hasSufficientHistory = totalCoveredDays >= Math.ceil(rangeDays * 0.75);

  if (!hasSufficientHistory) {
    trendState = 'limited';
    trendLabel = 'Limited comparison';
    trendDescription = 'over available history';
  } else if (recentCount === 0 && previousCount === 0) {
    trendState = 'no_activity';
    trendLabel = 'No activity';
    trendDescription = `in recent ${rangeDays} days`;
  } else if (previousCount === 0 && recentCount > 0) {
    trendState = 'new_activity';
    trendLabel = 'New activity';
    trendDescription = `vs previous ${rangeDays} days`;
  } else if (previousCount > 0 && recentCount === 0) {
    trendState = 'down';
    trendPercent = -100;
    trendLabel = '↓ 100%';
    trendDescription = `vs previous ${rangeDays} days`;
  } else if (previousCount > 0) {
    const diff = recentCount - previousCount;
    trendPercent = Math.round((diff / previousCount) * 100);

    if (trendPercent > 0) {
      trendState = 'up';
      trendLabel = `↑ ${trendPercent}%`;
    } else if (trendPercent < 0) {
      trendState = 'down';
      trendLabel = `↓ ${Math.abs(trendPercent)}%`;
    } else {
      trendState = 'steady';
      trendLabel = 'No change';
    }
    trendDescription = `vs previous ${rangeDays} days`;
  }

  // 2. Contributor Insights
  const contributorMap = new Map();
  for (const commit of filteredCommits) {
    const name = commit.author?.name || commit.author?.username || commit.actor || 'Unknown';
    const current = contributorMap.get(name) || { name, commits: 0, additions: 0, deletions: 0 };
    current.commits += 1;
    if (commit.additions != null) current.additions += commit.additions;
    if (commit.deletions != null) current.deletions += commit.deletions;
    contributorMap.set(name, current);
  }

  const sortedContributors = [...contributorMap.values()]
    .sort((a, b) => b.commits - a.commits)
    .map((c) => ({
      ...c,
      sharePercent: filteredCommits.length > 0 ? Math.round((c.commits / filteredCommits.length) * 100) : 0,
    }));

  const githubContributors = dashboardData?.contributors?.top || [];
  const enrichedContributors = sortedContributors.map((c) => {
    const match = githubContributors.find(
      (gc) => gc.login?.toLowerCase() === c.name.toLowerCase()
    );
    return {
      ...c,
      avatarUrl: match?.avatarUrl || null,
    };
  });

  // 3. Code Change Insights
  const commitsWithStats = filteredCommits.filter(
    (c) => c.additions != null && c.deletions != null
  );
  const totalAdditions = commitsWithStats.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = commitsWithStats.reduce((sum, c) => sum + c.deletions, 0);
  const netChange = totalAdditions - totalDeletions;
  const avgChangesPerCommit =
    commitsWithStats.length > 0
      ? Math.round((totalAdditions + totalDeletions) / commitsWithStats.length)
      : null;

  // 4. Most Active Areas (Directories)
  const dirMap = new Map();
  for (const commit of filteredCommits) {
    for (const fileObj of commit.files || []) {
      const path = typeof fileObj === 'string' ? fileObj : fileObj.path;
      if (!path) continue;
      const slashIdx = path.indexOf('/');
      const dir = slashIdx === -1 ? '(root)' : path.slice(0, slashIdx);
      dirMap.set(dir, (dirMap.get(dir) || 0) + 1);
    }
  }

  let activeAreas = [...dirMap.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (activeAreas.length === 0 && dashboardData?.architecture?.directories) {
    activeAreas = dashboardData.architecture.directories.slice(0, 5).map((d) => ({
      dir: d.path,
      count: d.fileCount,
    }));
  }

  // 5. Engineering Summary Highlights
  const activeDaysCount = buckets.filter((b) => b.count > 0).length;
  const avgCommitsPerDay = (filteredCommits.length / rangeDays).toFixed(1);

  let peakBucket = buckets[0] || null;
  let maxCount = -1;
  for (const b of buckets) {
    if (b.count > maxCount) {
      maxCount = b.count;
      peakBucket = b;
    }
  }

  // 6. Transparent Activity Health Score
  const daysSinceNewest = Math.max(0, Math.floor((now - newestTime) / (1000 * 60 * 60 * 24)));
  let recencyScore = 5;
  if (daysSinceNewest <= 2) recencyScore = 40;
  else if (daysSinceNewest <= 7) recencyScore = 30;
  else if (daysSinceNewest <= 14) recencyScore = 20;
  else if (daysSinceNewest <= 30) recencyScore = 10;

  const activeBucketCount = buckets.filter((b) => b.count > 0).length;
  const consistencyRatio = buckets.length > 0 ? activeBucketCount / buckets.length : 0;
  const consistencyScore = Math.round(consistencyRatio * 30);

  const distinctAuthors = sortedContributors.length;
  let diversityScore = 10;
  if (distinctAuthors >= 4) diversityScore = 30;
  else if (distinctAuthors >= 2) diversityScore = 25;
  else if (distinctAuthors === 1) diversityScore = 15;

  const totalHealthScore = Math.min(100, recencyScore + consistencyScore + diversityScore);
  const healthLabel =
    totalHealthScore >= 75
      ? 'High Activity'
      : totalHealthScore >= 45
      ? 'Moderate Activity'
      : 'Low Activity';

  const historyBannerMessage = isLimitedHistory
    ? `Showing activity over available synced history (${totalCoveredDays} days).`
    : `Showing activity for the selected ${rangeDays}-day period.`;

  return {
    available: true,
    rangeDays,
    totalCommits: filteredCommits.length,
    isLimitedHistory,
    totalCoveredDays,
    historyBannerMessage,
    buckets,
    recentCount,
    previousCount,
    trendPercent,
    trendState,
    trendLabel,
    trendDescription,
    topContributors: enrichedContributors.slice(0, 5),
    totalContributorsCount: sortedContributors.length,
    codeChanges: {
      hasStats: commitsWithStats.length > 0,
      totalAdditions,
      totalDeletions,
      netChange,
      avgChangesPerCommit,
      commitsWithStatsCount: commitsWithStats.length,
    },
    activeAreas,
    highlights: {
      peakBucketLabel: peakBucket?.label || 'N/A',
      peakBucketDate: peakBucket?.formattedDate || 'N/A',
      peakBucketCount: peakBucket?.count || 0,
      peakBucketAdditions: peakBucket?.additions || 0,
      peakBucketDeletions: peakBucket?.deletions || 0,
      activeDaysCount,
      totalDaysCount: rangeDays,
      unitLabel: isWeekly ? 'weeks' : 'days',
      avgCommitsPerDay,
    },
    health: {
      score: totalHealthScore,
      label: healthLabel,
      recencyScore,
      consistencyScore,
      diversityScore,
      daysSinceNewest,
    },
  };
}
