import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { syncUserAccessState } from '@/utils/auth/recoverExistingUserAccess';
import { appParams } from '@/lib/app-params';

async function hasLocalSession() {
  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(appParams.appId || '')}/entities/Notification?limit=1`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'X-App-Id': appParams.appId || '' },
    });
    return res.ok ? true : res.status === 401 || res.status === 403 ? false : null;
  } catch {
    return null;
  }
}

/**
 * Wraps a page and redirects to login if not authenticated.
 * The migrated installation uses an HttpOnly appgestor_session cookie, so
 * Base44's token-only isAuthenticated() cannot be the sole auth authority.
 */
export default function RequireAuth({ children, requireRole }) {
  const [status, setStatus] = useState('loading'); // loading | ok | forbidden

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const sdkAuth = await base44.auth.isAuthenticated().catch(() => false);
        const localAuth = appParams.token ? null : await hasLocalSession();
        const isAuth = sdkAuth || localAuth === true;

        if (!isAuth) {
          const href = window.location.href;
          const safeRedirect = href.includes('/login') ? undefined : href;
          base44.auth.redirectToLogin(safeRedirect);
          return;
        }

        if (requireRole) {
          try {
            const authUser = await base44.auth.me();
            const recovery = await syncUserAccessState(authUser, { origin: 'require-auth' });
            const user = recovery?.recovered ? recovery.user : authUser;
            const roles = Array.isArray(requireRole) ? requireRole : [requireRole];
            const userRoles = [
              user.role,
              user.role === 'admin' ? 'COORDENADOR' : null,
              user.role === 'ADMIN' ? 'COORDENADOR' : null,
            ].filter(Boolean);
            const allowed = roles.some((r) => userRoles.includes(r));
            if (!allowed) {
              if (!cancelled) setStatus('forbidden');
              return;
            }
          } catch (roleError) {
            // A valid local session is enough to stop the redirect loop. If
            // the role cannot be resolved because the legacy SDK has no token,
            // let the page render and let server-side session checks enforce
            // protected entity/function requests.
            console.warn('Role lookup through legacy auth unavailable:', roleError);
          }
        }

        if (!cancelled) setStatus('ok');
      } catch (error) {
        console.error('RequireAuth check failed:', error);
        if (!cancelled) setStatus('ok');
      }
    };

    check();
    return () => { cancelled = true; };
  }, [requireRole]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Verificando acesso existente…
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
