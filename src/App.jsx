import React, { Suspense, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ErrorBoundary from './lib/ErrorBoundary';
import AccessDenied from './lib/AccessDenied';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { PatrocinadorViewProvider } from '@/context/PatrocinadorViewContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { base44 } from '@/api/base44Client';
import { canAccessPage, isObservador, isPatrocinador } from '@/components/auth/permissions';
import { normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;
const PUBLIC_ROUTES = new Set(['/Cadastro', '/Home']);
const PERMISSION_TIMEOUT_MS = 2200;
const PERMISSION_CACHE_TTL_MS = 10 * 60 * 1000;
const PERMISSION_RATE_LIMIT_COOLDOWN_MS = 90 * 1000;

const permissionCache = new Map();
const permissionInflight = new Map();
let permissionRateLimitUntil = 0;

function isRateLimitError(error) {
  return /rate limit/i.test(String(error?.message || error || ''));
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function readPermissionCache(email) {
  const key = normalizeEmail(email || '');
  if (!key) return null;
  const cached = permissionCache.get(key);
  if (cached && Date.now() - cached.savedAt <= PERMISSION_CACHE_TTL_MS) return cached.value;

  try {
    const raw = localStorage.getItem(`museus_centro_user_permission_${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - Number(parsed.savedAt) > PERMISSION_CACHE_TTL_MS) return null;
    permissionCache.set(key, { value: parsed.value || null, savedAt: Number(parsed.savedAt) });
    return parsed.value || null;
  } catch {
    return null;
  }
}

function writePermissionCache(email, value) {
  const key = normalizeEmail(email || '');
  if (!key) return;
  const payload = { value: value || null, savedAt: Date.now() };
  permissionCache.set(key, payload);
  try {
    localStorage.setItem(`museus_centro_user_permission_${key}`, JSON.stringify(payload));
  } catch {
    // cache é otimização; falha não bloqueia a página
  }
}

async function loadUserPermissionOnce(email) {
  const key = normalizeEmail(email || '');
  if (!key) return null;

  const cached = readPermissionCache(key);
  if (cached) return cached;

  if (Date.now() < permissionRateLimitUntil) return null;
  if (permissionInflight.has(key)) return permissionInflight.get(key);

  const promise = withTimeout(
    base44.entities.UserPermission.filter({ user_email: key }),
    PERMISSION_TIMEOUT_MS,
    []
  )
    .then((permissions) => {
      const permission = Array.isArray(permissions) ? permissions[0] || null : null;
      writePermissionCache(key, permission);
      return permission;
    })
    .catch((error) => {
      if (isRateLimitError(error)) {
        permissionRateLimitUntil = Date.now() + PERMISSION_RATE_LIMIT_COOLDOWN_MS;
        console.warn('[Permissões] Rate limit. Usando perfil básico temporariamente.', error);
        return readPermissionCache(key) || null;
      }
      console.warn('[Permissões] Falha ao carregar permissões. Liberando página com perfil básico.', error);
      return readPermissionCache(key) || null;
    })
    .finally(() => {
      permissionInflight.delete(key);
    });

  permissionInflight.set(key, promise);
  return promise;
}

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

function SafePage({ Page, pageName }) {
  const { user } = useAuth();
  const [userPermission, setUserPermission] = useState(() => readPermissionCache(user?.email));
  const [permissionLoaded, setPermissionLoaded] = useState(true);

  useEffect(() => {
    let mounted = true;
    const email = user?.email;

    if (!email) {
      setUserPermission(null);
      setPermissionLoaded(true);
      return () => {
        mounted = false;
      };
    }

    const cached = readPermissionCache(email);
    if (cached) {
      setUserPermission(cached);
      setPermissionLoaded(true);
    }

    async function loadPermissions() {
      setPermissionLoaded(true);
      const permission = await loadUserPermissionOnce(email);
      if (mounted) {
        setUserPermission(permission || null);
        setPermissionLoaded(true);
      }
    }

    loadPermissions();

    return () => {
      mounted = false;
    };
  }, [user?.email]);

  const userWithPermission = user ? { ...user, base_role: userPermission?.base_role || user.base_role } : null;
  const sponsor = isPatrocinador(userWithPermission);
  const sponsorOrObserver = sponsor || isObservador(userWithPermission, userPermission);

  if (!permissionLoaded) return <LoadingScreen />;

  if (pageName === 'Dashboard' && sponsorOrObserver) {
    return <Navigate to="/DashboardPatrocinador" replace />;
  }

  if (userWithPermission && !canAccessPage(pageName, userWithPermission, userPermission)) {
    if (sponsorOrObserver) {
      return <Navigate to="/DashboardPatrocinador" replace />;
    }
    return (
      <LayoutWrapper currentPageName={pageName}>
        <AccessDenied />
      </LayoutWrapper>
    );
  }

  if (!Page) {
    return (
      <ErrorBoundary>
        <LayoutWrapper currentPageName={pageName}>
          <div className="min-h-[60vh] flex items-center justify-center px-4">
            <div className="max-w-md w-full border border-amber-200 bg-amber-50 rounded-2xl p-5 text-center text-amber-800">
              <h1 className="text-lg font-semibold">Página não registrada corretamente</h1>
              <p className="mt-2 text-sm">A rota existe, mas o componente da página não foi carregado.</p>
            </div>
          </div>
        </LayoutWrapper>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary key={pageName}>
      <LayoutWrapper currentPageName={pageName}>
        <Suspense fallback={<LoadingScreen />}>
          <Page />
        </Suspense>
      </LayoutWrapper>
    </ErrorBoundary>
  );
}

function AuthenticatedApp() {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
  } = useAuth();
  const location = useLocation();
  const publicPageName = location.pathname.replace(/^\//, '') || 'Home';
  const PublicPage = PUBLIC_ROUTES.has(location.pathname) ? Pages[publicPageName] : null;

  if (isLoadingPublicSettings || isLoadingAuth) return <LoadingScreen />;

  if (authError) {
    if (PublicPage) {
      return (
        <ErrorBoundary key={publicPageName}>
          <Suspense fallback={<LoadingScreen />}>
            <PublicPage />
          </Suspense>
        </ErrorBoundary>
      );
    }

    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }

    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }

    return <UserNotRegisteredError />;
  }

  return (
    <div key={location.pathname}>
      <Routes>
        <Route path="/" element={<SafePage Page={MainPage} pageName={mainPageKey} />} />

        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={<SafePage Page={Page} pageName={path} />}
          />
        ))}

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <PatrocinadorViewProvider>
            <QueryClientProvider client={queryClientInstance}>
              <Router>
                <AuthenticatedApp />
              </Router>
              <Toaster
                position="top-right"
                richColors
                expand={false}
                visibleToasts={3}
                duration={3000}
                closeButton
              />
            </QueryClientProvider>
          </PatrocinadorViewProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
