import React, { useEffect, useState } from 'react';
import { Toaster } from "sonner";
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
import Aparencia from './pages/Aparencia';

import ProgramacaoEspelho from './pages/ProgramacaoEspelho';
import Agenda from './pages/Agenda';
import RubricasPorMuseu from './pages/RubricasPorMuseu';
import RelatorioFisicoFinanceiro from './pages/RelatorioFisicoFinanceiro';
import RelatorioFisicoFinanceiroRevisao from './pages/RelatorioFisicoFinanceiroRevisao';
import BaseConhecimento from './pages/BaseConhecimento';
import DashboardPatrocinador from './pages/DashboardPatrocinadorSync';
import EntradaUnica from './pages/EntradaUnica.jsx';
import Mensagens from './pages/Mensagens.jsx';
import GuiaNotaFiscal from './pages/GuiaNotaFiscal';
import ConviteAcesso from './pages/ConviteAcesso';
import NotificationSettings from './pages/NotificationSettings';
import NFDriveBackupSyncInstaller from '@/lib/nfDriveBackupSync';
import PublicoAprovadoAuditButton from '@/components/dashboard/PublicoAprovadoAuditButton';
import { base44 } from '@/api/base44Client';
import { canAccessPage, isObservador, isPatrocinador } from '@/components/auth/permissions';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;
const PUBLIC_ROUTES = new Set(['/Cadastro', '/Home']);

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

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
        const permissions = await base44.entities.UserPermission.filter({
          user_email: user.email.toLowerCase(),
        });

        if (mounted) {
          setUserPermission(permissions?.[0] || null);
          setPermissionLoaded(true);
        }
      } catch {
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

  if (!permissionLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (pageName === 'Dashboard' && sponsorOrObserver) {
    return <Navigate to="/DashboardPatrocinador" replace />;
  }

  if (userWithPermission && !canAccessPage(pageName, userWithPermission, userPermission)) {
    if (sponsor) {
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
        <Page />
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

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (PublicPage) {
      return (
        <ErrorBoundary key={publicPageName}>
          <PublicPage />
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
      <NFDriveBackupSyncInstaller />
      <PublicoAprovadoAuditButton />

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <Routes>
            <Route
              path="/"
              element={<SafePage Page={MainPage} pageName={mainPageKey} />}
            />

            {Object.entries(Pages).map(([path, Page]) => (
              <Route
                key={path}
                path={`/${path}`}
                element={<SafePage Page={Page} pageName={path} />}
              />
            ))}


            <Route path="/RubricasPorMuseu" element={<SafePage Page={RubricasPorMuseu} pageName="RubricasPorMuseu" />} />
            <Route path="/BaseConhecimento" element={<SafePage Page={BaseConhecimento} pageName="BaseConhecimento" />} />
            <Route path="/ProgramacaoEspelho" element={<SafePage Page={ProgramacaoEspelho} pageName="ProgramacaoEspelho" />} />
            <Route path="/Agenda" element={<SafePage Page={Agenda} pageName="Agenda" />} />
            <Route path="/DashboardPatrocinador" element={<SafePage Page={DashboardPatrocinador} pageName="DashboardPatrocinador" />} />
            <Route path="/FinanceiroPatrocinador" element={<SafePage Page={DashboardPatrocinador} pageName="FinanceiroPatrocinador" />} />
            <Route path="/EntradaUnica" element={<SafePage Page={EntradaUnica} pageName="EntradaUnica" />} />
            <Route path="/Mensagens" element={<SafePage Page={Mensagens} pageName="Mensagens" />} />
            <Route path="/GuiaNotaFiscal" element={<SafePage Page={GuiaNotaFiscal} pageName="GuiaNotaFiscal" />} />
            <Route path="/Aparencia" element={<SafePage Page={Aparencia} pageName="Aparencia" />} />
            <Route path="/RelatorioFisicoFinanceiro" element={<SafePage Page={RelatorioFisicoFinanceiro} pageName="RelatorioFisicoFinanceiro" />} />
            <Route path="/RelatorioFisicoFinanceiroRevisao" element={<SafePage Page={RelatorioFisicoFinanceiroRevisao} pageName="RelatorioFisicoFinanceiroRevisao" />} />
            <Route path="/ConviteAcesso" element={<SafePage Page={ConviteAcesso} pageName="ConviteAcesso" />} />
            <Route path="/NotificationSettings" element={<SafePage Page={NotificationSettings} pageName="NotificationSettings" />} />

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
