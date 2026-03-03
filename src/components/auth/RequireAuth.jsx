import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Wraps a page and redirects to login if not authenticated.
 * If `requireRole` is provided, redirects to /dashboard if role doesn't match.
 */
export default function RequireAuth({ children, requireRole }) {
  const [status, setStatus] = useState('loading'); // loading | ok | redirect

  useEffect(() => {
    const check = async () => {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        // Avoid passing a login URL as the redirect target (would cause infinite loop)
        const currentPath = window.location.pathname + window.location.search;
        const safeRedirect = currentPath.includes('/login') ? undefined : window.location.href;
        base44.auth.redirectToLogin(safeRedirect);
        return;
      }
      if (requireRole) {
        const user = await base44.auth.me();
        const roles = Array.isArray(requireRole) ? requireRole : [requireRole];
        // also accept 'admin' and 'ADMIN' as equivalent to 'COORDENADOR'
        const userRoles = [user.role, user.role === 'admin' ? 'COORDENADOR' : null, user.role === 'ADMIN' ? 'COORDENADOR' : null].filter(Boolean);
        const allowed = roles.some(r => userRoles.includes(r));
        if (!allowed) {
          setStatus('forbidden');
          return;
        }
      }
      setStatus('ok');
    };
    check();
  }, [requireRole]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-black">Acesso restrito</p>
          <p className="text-sm text-gray-500 mt-1">
            Você não tem permissão para acessar esta área.
          </p>
        </div>
      </div>
    );
  }

  return children;
}