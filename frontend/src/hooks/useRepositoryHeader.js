import { useMemo } from 'react';

/**
 * Display-only fallback for the header/sidebar when no repository is
 * selected at all -- never a source of repository *metrics*. Identical
 * constant CommandCenterPage/ArchitecturePage/SourceControlPage each
 * independently declared before Task 77 (Tasks 68/69/57's separate,
 * coincidentally-identical choices).
 */
const DEFAULT_REPO = { name: 'seis-ai-copilot', owner: 'seis-ai' };

/**
 * Formats a real timestamp as a relative string ("3 hours ago"); never
 * fabricates a time when the input is missing. Byte-identical to the
 * three copies this replaces -- CommandCenterPage, ArchitecturePage, and
 * SourceControlPage each declared this exact function independently
 * (confirmed by direct comparison, Task 77 reconnaissance). Exported
 * separately from `useRepositoryHeader` because two of those three pages
 * also use it directly for non-header purposes (CommandCenterPage's
 * activity feed, SourceControlPage's `mapCommit`), not only for the
 * header derivation below.
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

/**
 * Task 77: the single shared derivation of the repository header/sidebar
 * display object (`{name, owner, branch, status, lastUpdated}`) that
 * `CommandCenterHeader`/`CommandCenterSidebar`/`CopilotDrawer` all
 * expect -- previously three independent `useMemo` blocks (one per
 * page), confirmed by direct comparison to differ only in *which* real
 * status signal and optional richer-data override each page has
 * available, never in the derivation formula itself.
 *
 * Deliberately takes an already-resolved `identity` object rather than
 * calling `useRepositoryIdentity(repositoryId)` itself: each page's own
 * dashboard/branch-sync fetch effect depends on `identity.status`
 * *before* that page's own richer data (`dashboardData`, etc.) exists,
 * so wrapping the identity fetch inside this hook would force an
 * impossible call-order (needing `dashboardData` as an argument before
 * the effect that produces it could run) or a second, duplicate
 * `useRepositoryIdentity` call. Every caller keeps its own single,
 * existing `useRepositoryIdentity(repositoryId)` call exactly as before
 * -- this hook adds zero network requests.
 *
 * @param {{repository: object|null, status: string, error: string|null}} identity
 *   The exact object `useRepositoryIdentity` already returns.
 * @param {object} [options]
 * @param {'idle'|'loading'|'ready'|'error'} [options.syncStatus] - the
 *   caller's own real sync/loading signal (e.g. Command Center/
 *   Architecture's `dashboardStatus`, or Source Control's
 *   `branchSyncStatus`) -- drives `headerRepo.status`
 *   ('synced'/'stale'/'analyzing'), exactly as each page already
 *   computed it independently.
 * @param {string} [options.branchNameOverride] - a more current branch
 *   name from a richer fetch the caller already has (Command Center/
 *   Architecture's `dashboardData.branch.name`); omitted entirely by
 *   Source Control, which has no such fetch -- falls back to
 *   `identity.repository.defaultBranch`, unchanged from its existing
 *   behavior.
 * @param {string} [options.lastFetchedAtOverride] - same override
 *   pattern for the relative-time source.
 * @returns {{name: string, owner: string, branch: string, status: string, lastUpdated: string}}
 */
export function useRepositoryHeader(identity, { syncStatus, branchNameOverride, lastFetchedAtOverride } = {}) {
  return useMemo(() => {
    if (!identity.repository) {
      return { ...DEFAULT_REPO, branch: 'main', status: 'stale', lastUpdated: 'No real repository selected' };
    }
    const status = syncStatus === 'ready' ? 'synced' : syncStatus === 'error' ? 'stale' : 'analyzing';
    const branchName = branchNameOverride || identity.repository.defaultBranch || 'main';
    const relative = formatRelativeTime(lastFetchedAtOverride || identity.repository.lastFetchedAt);
    return {
      name: identity.repository.name,
      owner: identity.repository.owner,
      branch: branchName,
      status,
      lastUpdated: relative ? `Updated ${relative}` : 'Sync time unknown',
    };
  }, [identity.repository, syncStatus, branchNameOverride, lastFetchedAtOverride]);
}
