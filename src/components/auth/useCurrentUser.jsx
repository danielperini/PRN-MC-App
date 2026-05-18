import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isCoordGeral as _isCoordGeral, isCoordenador as _isCoordenador } from './permissions';
import { syncUserAccessState } from '@/utils/auth/recoverExistingUserAccess';

let cachedUser = null;
let fetchPromise = null;

/**
 * Hook to get the current authenticated user.
 * Uses a module-level cache to avoid repeated API calls.
 * Returns { user, isLoading, isCoordenador, isCoordGeral }
 */
export function useCurrentUser() {
  const [user, setUser] = useState(cachedUser);
  const [isLoading, setIsLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoading(false);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = base44.auth.me().then(u => {
        return syncUserAccessState(u, { origin: 'use-current-user' }).then((recovery) => {
          cachedUser = recovery?.recovered ? recovery.user : u;
          return cachedUser;
        });
      }).catch(() => null);
    }
    fetchPromise.then(u => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  const isCoordenador = _isCoordenador(user);
  const coordGeral = _isCoordGeral(user);

  return { user, isLoading, isCoordenador, isCoordGeral: coordGeral };
}

// Call this after logout or role change to reset cache
export function clearUserCache() {
  cachedUser = null;
  fetchPromise = null;
}
