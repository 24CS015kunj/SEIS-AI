/**
 * MOCK ONLY — no network calls, no GitHub API, no real Git operations. This
 * module builds a static Source Control data model from the repository
 * handed off elsewhere in the app. Shape is intentionally flat/serializable
 * so a real `/api/repositories/:id/source-control` response could populate
 * it later without any component in `components/sourceControl/` changing.
 */

const AUTHORS = [
  { name: 'Alex Chen', handle: 'alex-dev', initials: 'AC' },
  { name: 'Sarah Kim', handle: 'sarah-eng', initials: 'SK' },
  { name: 'David Martinez', handle: 'david-m', initials: 'DM' },
  { name: 'Priya Nair', handle: 'priya-n', initials: 'PN' },
];

export function buildSourceControlData(repository) {
  const owner = repository?.owner ?? 'seis-ai';
  const name = repository?.name ?? 'seis-ai-copilot';

  return {
    repository: {
      name,
      owner,
      defaultBranch: 'main',
      status: 'synced',
    },

    branches: [
      { id: 'main', name: 'main', type: 'main', lastCommitMessage: 'Update JWT rotation middleware', lastCommitAt: '3 hours ago', ahead: 0, behind: 0, isCurrent: true },
      { id: 'feature-jwt-refresh', name: 'feature/jwt-refresh', type: 'feature', lastCommitMessage: 'Add refresh token rotation', lastCommitAt: '6 hours ago', ahead: 4, behind: 12, isCurrent: false },
      { id: 'feature-search-reindex', name: 'feature/search-reindex', type: 'feature', lastCommitMessage: 'Rebuild AST search index on save', lastCommitAt: '1 day ago', ahead: 2, behind: 3, isCurrent: false },
      { id: 'release-v2-4', name: 'release/v2.4', type: 'release', lastCommitMessage: 'Bump version to 2.4.0', lastCommitAt: '2 days ago', ahead: 0, behind: 8, isCurrent: false },
      { id: 'hotfix-rate-limit', name: 'hotfix/rate-limit-headers', type: 'hotfix', lastCommitMessage: 'Add rate limit headers to API', lastCommitAt: '1 day ago', ahead: 1, behind: 5, isCurrent: false },
    ],

    commits: [
      {
        id: 'c1', shortHash: '7f3a9e2', branch: 'main',
        message: 'Update JWT rotation middleware',
        author: AUTHORS[0], timestamp: '3 hours ago',
        filesChanged: 3, additions: 42, deletions: 11,
        files: [
          { path: 'auth/middleware.js', additions: 28, deletions: 9 },
          { path: 'auth/jwt.js', additions: 10, deletions: 2 },
          { path: 'tests/auth/middleware.test.js', additions: 4, deletions: 0 },
        ],
      },
      {
        id: 'c2', shortHash: '4b2c1f8', branch: 'main',
        message: 'Optimize AST traversal graph',
        author: AUTHORS[1], timestamp: '5 hours ago',
        filesChanged: 2, additions: 67, deletions: 34,
        files: [
          { path: 'services/astIndexer.js', additions: 61, deletions: 34 },
          { path: 'services/astIndexer.test.js', additions: 6, deletions: 0 },
        ],
      },
      {
        id: 'c3', shortHash: '9e1d4a3', branch: 'hotfix/rate-limit-headers',
        message: 'Add rate limit headers to API',
        author: AUTHORS[2], timestamp: '1 day ago',
        filesChanged: 1, additions: 18, deletions: 3,
        files: [{ path: 'api/v1/router.js', additions: 18, deletions: 3 }],
      },
      {
        id: 'c4', shortHash: '3c8f12b', branch: 'main',
        message: 'Schema index on ast_health column',
        author: AUTHORS[0], timestamp: '2 days ago',
        filesChanged: 1, additions: 9, deletions: 0,
        files: [{ path: 'db/schema.prisma', additions: 9, deletions: 0 }],
      },
      {
        id: 'c5', shortHash: 'a1e6c77', branch: 'feature/jwt-refresh',
        message: 'Add refresh token rotation',
        author: AUTHORS[0], timestamp: '6 hours ago',
        filesChanged: 4, additions: 88, deletions: 20,
        files: [
          { path: 'auth/refreshToken.js', additions: 54, deletions: 4 },
          { path: 'auth/jwt.js', additions: 12, deletions: 8 },
          { path: 'models/Session.js', additions: 15, deletions: 6 },
          { path: 'tests/auth/refreshToken.test.js', additions: 7, deletions: 2 },
        ],
      },
      {
        id: 'c6', shortHash: 'd82f4e9', branch: 'feature/search-reindex',
        message: 'Rebuild AST search index on save',
        author: AUTHORS[3], timestamp: '1 day ago',
        filesChanged: 2, additions: 33, deletions: 5,
        files: [
          { path: 'services/searchIndexer.js', additions: 29, deletions: 5 },
          { path: 'services/searchIndexer.test.js', additions: 4, deletions: 0 },
        ],
      },
      {
        id: 'c7', shortHash: 'e5b9a01', branch: 'main',
        message: 'Fix flaky session-expiry test',
        author: AUTHORS[1], timestamp: '3 days ago',
        filesChanged: 1, additions: 6, deletions: 4,
        files: [{ path: 'tests/auth/session.test.js', additions: 6, deletions: 4 }],
      },
    ],

    pullRequests: [
      {
        id: 'pr1', number: 142, title: 'Add refresh token rotation to JWT auth flow',
        author: AUTHORS[0], status: 'open', branch: 'feature/jwt-refresh', targetBranch: 'main',
        updatedAt: '6 hours ago', comments: 5,
        description: 'Introduces short-lived access tokens with a rotating refresh token stored server-side. Closes the session-fixation gap flagged in the last security review.',
      },
      {
        id: 'pr2', number: 139, title: 'Rebuild AST search index incrementally on save',
        author: AUTHORS[3], status: 'open', branch: 'feature/search-reindex', targetBranch: 'main',
        updatedAt: '1 day ago', comments: 2,
        description: 'Avoids a full re-index on every save by diffing changed symbols only. Reduces reindex time from ~4s to ~300ms on this repository.',
      },
      {
        id: 'pr3', number: 137, title: 'Add rate limit headers to public API responses',
        author: AUTHORS[2], status: 'merged', branch: 'hotfix/rate-limit-headers', targetBranch: 'main',
        updatedAt: '1 day ago', comments: 3,
        description: 'Adds X-RateLimit-* headers so API consumers can back off before hitting 429s instead of after.',
      },
      {
        id: 'pr4', number: 131, title: 'Experiment: switch session store to Redis',
        author: AUTHORS[1], status: 'closed', branch: 'experiment/redis-sessions', targetBranch: 'main',
        updatedAt: '5 days ago', comments: 8,
        description: 'Closed without merging — reverted in favor of keeping sessions in the primary datastore until the caching layer lands.',
      },
    ],

    insights: [
      {
        id: 'sc-insight-1',
        severity: 'info',
        title: '2 pull requests awaiting review',
        description: '#142 and #139 have been open for 6+ hours with no reviewer activity yet.',
        category: 'Pull Requests',
      },
      {
        id: 'sc-insight-2',
        severity: 'warning',
        title: 'feature/jwt-refresh is 12 commits behind main',
        description: 'This branch risks a larger, riskier merge the longer it stays unsynced with main.',
        category: 'Branches',
      },
      {
        id: 'sc-insight-3',
        severity: 'warning',
        title: 'High commit frequency in auth/ this week',
        description: '3 of the last 7 commits touched auth/ — consistent with the churn hotspot flagged on the Dashboard.',
        category: 'Activity',
      },
      {
        id: 'sc-insight-4',
        severity: 'info',
        title: 'release/v2.4 has had no new commits in 2 days',
        description: 'May be ready to finalize, or may be stalled — worth a quick check before the next release window.',
        category: 'Branches',
      },
    ],

    copilotSuggestedQuestions: [
      'Which commits touched auth/ this week?',
      'Summarize what changed in feature/jwt-refresh.',
      'Who are the most active contributors right now?',
      'What is still open before the next release?',
    ],
  };
}
