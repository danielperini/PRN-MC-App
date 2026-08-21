const LOGIN_PATH = '/login';

function isLoginUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return url.pathname === LOGIN_PATH;
  } catch {
    return false;
  }
}

export function installSafeAuthRedirect(base44) {
  const auth = base44?.auth;
  if (!auth || typeof auth.redirectToLogin !== 'function' || auth.__appgestorSafeRedirect) {
    return;
  }

  const original = auth.redirectToLogin.bind(auth);

  auth.__appgestorOriginalRedirectToLogin = original;

  auth.redirectToLogin = (nextUrl) => {
    const current = window.location.href;

    // Nunca envie /login como from_url.
    // Isso evita a recursão:
    // /login -> /login?from_url=/login -> ...
    if (isLoginUrl(current) || isLoginUrl(nextUrl)) {
      return original('/');
    }

    return original(nextUrl || current);
  };

  auth.__appgestorSafeRedirect = true;
}
