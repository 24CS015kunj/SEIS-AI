import { LayoutGrid, GitBranch, Boxes, TrendingUp, Sparkles } from 'lucide-react';

/**
 * Single source of truth for authenticated app sidebar navigation.
 * Repository-scoped routes append `/:repositoryId` in CommandCenterSidebar.
 */
export const APP_NAV_ITEMS = [
  { label: 'Overview', icon: LayoutGrid, page: '/command-center', primary: true },
  { label: 'Architecture', icon: Boxes, page: '/architecture', primary: true },
  { label: 'Software Evolution', icon: TrendingUp, page: '/software-evolution', primary: true },
  { label: 'Source Control', icon: GitBranch, page: '/source-control', primary: true },
];
