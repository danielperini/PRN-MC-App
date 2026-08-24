export function installSafeAuthRedirect(base44) {
  const auth = base44?.auth;

  if (
    !auth ||
    typeof auth.redirectToLogin !== 'function' ||
    auth.__appgestorSafeRedirect
  ) {
    return;
  }

  const original = auth.redirectToLogin.bind(auth);

  auth.__appgestorOriginalRedirectToLogin = original;

  auth.redirectToLogin = (nextUrl) => {
    if (typeof window === 'undefined') return;

    const pathname = window.location.pathname;

    // Nunca interceptar o próprio login.
    if (pathname === '/login') return;

    // O OAuth Google deve ir diretamente para o backend.
    if (
      pathname === '/api/auth/google' ||
      pathname === '/api/apps/auth/google'
    ) {
      return;
    }

    let target = String(nextUrl || '/');

    try {
      const url = new URL(target, window.location.origin);

      if (url.pathname === '/login') {
        target = '/';
      } else if (url.origin === window.location.origin) {
        url.searchParams.delete('from_url');
        target = url.pathname + url.search + url.hash;
      } else {
        target = '/';
      }
    } catch {
      target = '/';
    }

    const loginUrl =
      target === '/'
        ? '/login'
        : `/login?from_url=${encodeURIComponent(
            `${window.location.origin}${target}`
          )}`;

    window.location.replace(loginUrl);
  };

  auth.__appgestorSafeRedirect = true;
}
