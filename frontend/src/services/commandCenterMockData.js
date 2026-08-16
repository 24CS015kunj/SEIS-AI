/**
 * MOCK ONLY — no network calls, no FastAPI, no real AI/LLM. This module
 * builds a static Command Center data model from the repository handed off
 * by the AI Repository Analysis page. Shape is intentionally flat and
 * serializable (no React/JSX inside it) so a real `/api/repositories/:id/dashboard`
 * response could populate the exact same shape later without any component
 * in `components/commandCenter/` needing to change.
 */

const RISK_LEVELS = ['low', 'moderate', 'elevated'];

function seededFrom(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function buildCommandCenterData(repository) {
  const seed = seededFrom(`${repository?.owner ?? 'seis-ai'}/${repository?.name ?? 'seis-ai-copilot'}`);
  const primaryLanguage = repository?.language ?? 'JavaScript';

  return {
    repository: {
      name: repository?.name ?? 'seis-ai-copilot',
      owner: repository?.owner ?? 'seis-ai',
      branch: 'main',
      language: primaryLanguage,
      lastUpdated: 'Updated 12 minutes ago',
      status: 'synced', // synced | analyzing | stale
    },

    overview: {
      files: (seed % 400) + 220,
      linesOfCode: (seed % 40000) + 18000,
      languages: buildLanguageMix(primaryLanguage),
      dependencies: (seed % 60) + 40,
      contributors: (seed % 9) + 4,
    },

    architecture: {
      layers: ['Interface', 'Application', 'Domain', 'Infrastructure'],
      nodes: [
        { id: 'ui', name: 'ui/', layer: 'Interface', files: 34, dependencies: 3, risk: 'low' },
        { id: 'api', name: 'api/v1/', layer: 'Application', files: 28, dependencies: 5, risk: 'low' },
        { id: 'services', name: 'services/', layer: 'Application', files: 22, dependencies: 6, risk: 'moderate' },
        { id: 'domain', name: 'domain/', layer: 'Domain', files: 18, dependencies: 2, risk: 'low' },
        { id: 'auth', name: 'auth/', layer: 'Domain', files: 12, dependencies: 4, risk: 'moderate' },
        { id: 'db', name: 'db/', layer: 'Infrastructure', files: 9, dependencies: 2, risk: 'low' },
        { id: 'infra', name: 'infra/', layer: 'Infrastructure', files: 11, dependencies: 3, risk: 'low' },
      ],
      relationships: [
        { from: 'ui', to: 'api' },
        { from: 'api', to: 'services' },
        { from: 'api', to: 'auth' },
        { from: 'services', to: 'domain' },
        { from: 'services', to: 'db' },
        { from: 'auth', to: 'domain' },
        { from: 'domain', to: 'infra' },
        { from: 'db', to: 'infra' },
      ],
      circularDependencies: 0,
    },

    insights: [
      {
        id: 'insight-1',
        severity: 'warning',
        title: 'High coupling detected in services/',
        description:
          'services/ is imported by 6 other modules with no clear interface boundary — changes here tend to ripple outward.',
        category: 'Architecture',
      },
      {
        id: 'insight-2',
        severity: 'critical',
        title: 'Test coverage appears limited in auth/',
        description:
          'No test files were found alongside auth/middleware and auth/controller — this is the most frequently modified module this month.',
        category: 'Quality',
      },
      {
        id: 'insight-3',
        severity: 'info',
        title: 'Architecture is moderately complex',
        description:
          `${(seed % 30) + 20} modules across 4 layers with a clear, mostly-unidirectional dependency flow and 0 circular dependencies.`,
        category: 'Architecture',
      },
      {
        id: 'insight-4',
        severity: 'warning',
        title: 'Dependency risk identified',
        description:
          '3 direct dependencies have not been updated in over a year and may be worth reviewing for security advisories.',
        category: 'Dependencies',
      },
    ],

    activity: [
      { id: 'a1', type: 'commit', message: 'Update JWT rotation middleware', actor: 'alex-dev', timestamp: '3 hours ago' },
      { id: 'a2', type: 'commit', message: 'Optimize AST traversal graph', actor: 'sarah-eng', timestamp: '5 hours ago' },
      { id: 'a3', type: 'commit', message: 'Add rate limit headers to API', actor: 'david-m', timestamp: '1 day ago' },
      { id: 'a4', type: 'analysis', message: 'Repository analysis completed', actor: 'SEIS AI Copilot', timestamp: '1 day ago' },
      { id: 'a5', type: 'commit', message: 'Schema index on ast_health column', actor: 'alex-dev', timestamp: '2 days ago' },
    ],

    copilot: {
      available: true,
      suggestedQuestions: [
        'How does authentication work in this project?',
        'Which module changes most often?',
        'Where are the highest-risk dependencies?',
        'Summarize the architecture in plain English.',
      ],
    },
  };
}

function buildLanguageMix(primaryLanguage) {
  const secondary = { JavaScript: 'CSS', TypeScript: 'JavaScript', Python: 'HTML' }[primaryLanguage] ?? 'CSS';
  return [
    { name: primaryLanguage, percent: 68 },
    { name: secondary, percent: 21 },
    { name: 'Other', percent: 11 },
  ];
}

export const RISK_LABEL = { low: 'Low risk', moderate: 'Moderate risk', elevated: 'Elevated risk' };
export const RISK_ORDER = RISK_LEVELS;
