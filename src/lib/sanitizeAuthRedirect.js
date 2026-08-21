const MAX_REDIRECT_LENGTH = 1200;

function cleanReturnPath(value) {
  if (typeof window === 'undefined') return '/';

  try {
    const target = new URL(value || '/', window.location.origin);
    // Never allow the login URL itself (or an encoded copy of it) to become
    // the nextUrl. That is what creates the recursive from_url chain.
    if (target.pathname === '/login') return '/';

    target.searchParams.delete('from_url');
    const query = target.searchParams.toString();
    const result = `${target.pathname}${query ? `?${query}` : ''}${target.hash || ''}`;
    return result.length <= MAX_REDIRECT_LENGTH ? result : '/';
  } catch {
    return '/';
  }
}

export function installAuthRedirectGuard(base44) {
  if (typeof window === 'undefined') return;
  const auth = base44?.auth;
  if (!auth || typeof auth.redirectToLogin !== 'function' || auth.__appgestorSafeRedirect) return;

  auth.__appgestorSafeRedirect = true;
  auth.redirectToLogin = (nextUrl) => {
    // If the browser is already on login, doing another login redirect is
    // always a loop. Stay put and let the login surface handle authentication.
    if (window.location.pathname === '/login') return;

    const returnPath = cleanReturnPath(nextUrl || window.location.href);
    const loginUrl = returnPath === '/'
      ? '/login'
      : `/login?from_url=${encodeURIComponent(`${window.location.origin}${returnPath}`)}`;

    window.location.replace(loginUrl);
  };
}
