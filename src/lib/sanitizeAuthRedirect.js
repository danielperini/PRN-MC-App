import { base44 } from '@/api/base44Client';

const MAX_REDIRECT_LENGTH = 1200;

function cleanReturnPath(value) {
  if (typeof window === 'undefined') return '/';

  try {
    const target = new URL(value || '/', window.location.origin);
    if (target.pathname === '/login') return '/';

    target.searchParams.delete('from_url');
    const query = target.searchParams.toString();
    const result = `${target.pathname}${query ? `?${query}` : ''}${target.hash || ''}`;
    return result.length <= MAX_REDIRECT_LENGTH ? result : '/';
  } catch {
    return '/';
  }
}

export function installAuthRedirectGuard(client = base44) {
  if (typeof window === 'undefined') return;
  const auth = client?.auth;
  if (!auth || typeof auth.redirectToLogin !== 'function' || auth.__appgestorSafeRedirect) return;

  // Preserve the SDK's real login redirect. The local /login route is only
  // the safe landing page; it must not recursively replace itself.
  if (typeof auth.__appgestorOriginalRedirectToLogin !== 'function') {
    auth.__appgestorOriginalRedirectToLogin = auth.redirectToLogin.bind(auth);
  }

  auth.__appgestorSafeRedirect = true;
  auth.redirectToLogin = (nextUrl) => {
    if (window.location.pathname === '/login') return;

    const returnPath = cleanReturnPath(nextUrl || window.location.href);
    const loginUrl = returnPath === '/'
      ? '/login'
      : `/login?from_url=${encodeURIComponent(`${window.location.origin}${returnPath}`)}`;

    window.location.replace(loginUrl);
  };
}

installAuthRedirectGuard();
