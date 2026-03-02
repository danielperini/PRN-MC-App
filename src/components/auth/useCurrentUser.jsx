import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook to get the current authenticated user.
 * Returns { user, isLoading, isCoordenador }
 */
export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    base44.auth.me()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  const isCoordenador = user?.role === 'COORDENADOR';

  return { user, isLoading, isCoordenador };
}