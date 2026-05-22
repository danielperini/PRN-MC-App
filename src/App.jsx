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
import { AnimatePresence, motion } from 'framer-motion';
import NFDriveBackupSyncInstaller from '@/lib/nfDriveBackupSync';
import PublicoAprovadoAuditButton from '@/components/dashboard/PublicoAprovadoAuditButton';
import { base44 } from '@/api/base44Client';
import { canAccessPage, isObservador, isPatrocinador } from '@/components/auth/permissions';
import { normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;
const PUBLIC_ROUTES = new Set(['/Cadastro', '/Home']);
const PERMISSION_TIMEOUT_MS = 3500;

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

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

function DeferredNonEssentialServices() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setEnabled(true), 3500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <NFDriveBackupSyncInstaller />
      <PublicoAprovadoAuditButton />
    </>
  );
}

function SafePage({ Page, pageName }) {
  const { user } = useAuth();
  const [userPermission, setUserPermission] = useState(null);
  const [permissionLoaded, setPermissionLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadPermissions() {
      if (mounted) setPermissionLoaded(false);
      if (!user?.email) {
        if (mounted) setUserPermission(null);
        if (mounted) setPermissionLoaded(true);
        return;
      }

      try {
        const permissions = await withTimeout(
          base44.entities.UserPermission.filter({
            user_email: normalizeEmail(user.email),
          }),
          PERMISSION_TIMEOUT_MS,
          []
        );

        if (mounted) {
          setUserPermission(permissions?.[0] || null);
          setPermissionLoaded(true);
        }
      } catch (error) {
        console.warn('[Permissões] Falha ao carregar permissões. Liberando página com perfil básico.', error);
        if (mounted) setUserPermission(null);
        if (mounted) setPermissionLoaded(true);
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
    <>
      <DeferredNonEssentialServices />

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
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
        </motion.div>
      </AnimatePresence>
    </>
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
