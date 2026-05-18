import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { syncUserAccessState } from '@/utils/auth/recoverExistingUserAccess';

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
        // Avoid infinite redirect loops - never pass a login URL as the redirect target
        const href = window.location.href;
        const safeRedirect = href.includes('/login') ? undefined : href;
        base44.auth.redirectToLogin(safeRedirect);
        return;
      }
      if (requireRole) {
        const authUser = await base44.auth.me();
        const recovery = await syncUserAccessState(authUser, { origin: 'require-auth' });
        const user = recovery?.recovered ? recovery.user : authUser;
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="mb-4 text-4xl">🔒</div>
          <p className="text-lg font-semibold text-black mb-2">Acesso Restrito</p>
          <p className="text-gray-600 text-sm mb-6">
            Esta área requer permissões especiais. Entre em contato com o administrador da plataforma se acredita que deveria ter acesso.
          </p>
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="outline">Voltar ao Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
