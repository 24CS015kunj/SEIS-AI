import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getActiveWorkspace,
  getDefaultRepositoryForWorkspace,
  setDefaultRepositoryForWorkspace,
} from '../services/workspaceService';
import { listRepositories } from '../services/repositoryService';

/**
 * Automatically resolves and navigates to the default repository for the active workspace
 * when a user visits a bare route (e.g. /command-center, /architecture, /source-control,
 * /software-evolution) without an explicit :repositoryId.
 *
 * Eliminates having to select a repository over and over again, while leaving the user
 * completely free to switch repositories via the header dropdown or workspace picker.
 *
 * @param {string|undefined} repositoryId - the current URL param
 * @param {string} routePrefix - e.g. '/command-center', '/architecture', etc.
 * @returns {{ isResolving: boolean }}
 */
export function useAutoResolveDefaultRepository(repositoryId, routePrefix) {
  const navigate = useNavigate();
  const [isResolving, setIsResolving] = useState(!repositoryId);

  useEffect(() => {
    // If a repositoryId is already in the URL, no resolution is needed.
    if (repositoryId) {
      setIsResolving(false);
      return;
    }

    let isMounted = true;
    setIsResolving(true);

    const activeWs = getActiveWorkspace();
    const cachedDefaultId = activeWs ? getDefaultRepositoryForWorkspace(activeWs._id) : null;

    if (cachedDefaultId) {
      if (isMounted) {
        setIsResolving(false);
        navigate(`${routePrefix}/${cachedDefaultId}`, { replace: true });
      }
      return;
    }

    // If no default repo is cached for this workspace, fetch existing repositories
    listRepositories()
      .then((repos) => {
        if (!isMounted) return;
        const safeRepos = Array.isArray(repos) ? repos : [];
        if (safeRepos.length > 0) {
          const targetRepo = safeRepos[0];
          if (activeWs?._id) {
            setDefaultRepositoryForWorkspace(
              activeWs._id,
              targetRepo._id,
              targetRepo.fullName || targetRepo.name
            );
          }
          navigate(`${routePrefix}/${targetRepo._id}`, { replace: true });
        }
        setIsResolving(false);
      })
      .catch(() => {
        if (isMounted) setIsResolving(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repositoryId, routePrefix, navigate]);

  return { isResolving };
}
