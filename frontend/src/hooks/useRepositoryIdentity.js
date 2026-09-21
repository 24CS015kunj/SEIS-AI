import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepository } from '../services/repositoryService';

/**
 * The single source of truth for "what repository is this page showing"
 * (Task 71). `repositoryId` comes from the URL (`useParams()`), never
 * from React Router `location.state` -- state does not survive a browser
 * refresh or a direct/pasted link, which is exactly the gap this hook
 * closes. Every Command Center page (Dashboard, Architecture, Source
 * Control) calls this the same way, so "does this repository exist and
 * what's its real name/owner/branch" is answered identically everywhere
 * instead of three separate, previously-drifting `headerRepo` derivations
 * (Task 70's audit found one of those three had silently regressed to
 * showing fabricated fallback data).
 *
 * @param {string|undefined} repositoryId
 * @returns {{repository: object|null, status: 'idle'|'loading'|'ready'|'not-found'|'error', error: string|null}}
 *
 * `status`:
 *  - 'idle'      -- no `repositoryId` at all (the honest "no repository
 *                    selected" case -- never faked).
 *  - 'loading'   -- resolving `repositoryId` against the real backend.
 *  - 'ready'     -- `repository` is real, owned, already-synced data.
 *  - 'not-found' -- a real HTTP 404: the ID is malformed, doesn't exist,
 *                    or isn't owned by the current user. Distinct from
 *                    'error' so the UI can say "Repository not found"
 *                    rather than a generic failure message.
 *  - 'error'     -- a genuine network/server failure, not a "this
 *                    repository doesn't exist" answer.
 */
export function useRepositoryIdentity(repositoryId) {
  const [status, setStatus] = useState('idle');
  const [repository, setRepository] = useState(null);
  const [error, setError] = useState(null);

  // Guards `refresh()` (below) against writing a resolved response into
  // state after this hook's owning component has unmounted -- the exact
  // scenario the Source Control ingestion-status poll hits every time a
  // user navigates away while a poll request is still in flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!repositoryId) {
      setStatus('idle');
      setRepository(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    getRepository(repositoryId)
      .then((repo) => {
        if (cancelled) return;
        setRepository(repo);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setRepository(null);
        if (err.response?.status === 404 || err.response?.status === 400) {
          setStatus('not-found');
        } else {
          setStatus('error');
          setError(err.response?.data?.message || 'Failed to load repository.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [repositoryId]);

  // Stable across renders (memoized on `repositoryId` alone) so a caller
  // that polls this on an interval -- Source Control's ingestion-status
  // poll (§11) is the only current caller -- can depend on it without the
  // interval being torn down and recreated on every tick.
  const refresh = useCallback(async () => {
    if (!repositoryId) return null;
    try {
      const repo = await getRepository(repositoryId);
      if (!mountedRef.current) return repo;
      setRepository(repo);
      setStatus('ready');
      return repo;
    } catch (err) {
      return null;
    }
  }, [repositoryId]);

  return { repository, status, error, refresh };
}
