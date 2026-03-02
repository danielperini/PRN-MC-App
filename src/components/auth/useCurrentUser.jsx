import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

let cachedUser = null;
let fetchPromise = null;

/**
 * Hook to get the current authenticated user.
 * Uses a module-level cache to avoid repeated API calls.
 * Returns { user, isLoading, isCoordenador }
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
        cachedUser = u;
        return u;
      }).catch(() => null);
    }
    fetchPromise.then(u => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  const isCoordenador = user?.role === 'COORDENADOR' || user?.role === 'admin' || user?.role === 'ADMIN';

  return { user, isLoading, isCoordenador };
}

// Call this after logout or role change to reset cache
export function clearUserCache() {
  cachedUser = null;
  fetchPromise = null;
}