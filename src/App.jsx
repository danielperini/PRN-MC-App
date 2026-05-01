import React from 'react';
import { Toaster } from "sonner";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { PatrocinadorViewProvider } from '@/context/PatrocinadorViewContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AnimatePresence, motion } from 'framer-motion';
import Aparencia from './pages/Aparencia';
import ChecklistProducao from './pages/ChecklistProducao';
import ProgramacaoEspelho from './pages/ProgramacaoEspelho';
import Agenda from './pages/Agenda';
import RubricasPorMuseu from './pages/RubricasPorMuseu';
import BaseConhecimento from './pages/BaseConhecimento';
import DashboardPatrocinador from './pages/DashboardPatrocinador';
import EntradaUnica from './pages/EntradaUnica.jsx';
import Mensagens from './pages/Mensagens.jsx';
import GuiaNotaFiscal from './pages/GuiaNotaFiscal';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

function AuthenticatedApp() {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
  } = useAuth();
  const location = useLocation();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
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
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            {MainPage ? <MainPage /> : null}
          </LayoutWrapper>
        }
      />

      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}

      <Route
        path="/ChecklistProducao"
        element={
          <LayoutWrapper currentPageName="ChecklistProducao">
            <ChecklistProducao />
          </LayoutWrapper>
        }
      />

      <Route
        path="/RubricasPorMuseu"
        element={
          <LayoutWrapper currentPageName="RubricasPorMuseu">
            <RubricasPorMuseu />
          </LayoutWrapper>
        }
      />

      <Route
        path="/BaseConhecimento"
        element={
          <LayoutWrapper currentPageName="BaseConhecimento">
            <BaseConhecimento />
          </LayoutWrapper>
        }
      />

      <Route
        path="/ProgramacaoEspelho"
        element={
          <LayoutWrapper currentPageName="ProgramacaoEspelho">
            <ProgramacaoEspelho />
          </LayoutWrapper>
        }
      />

      <Route
        path="/Agenda"
        element={
          <LayoutWrapper currentPageName="Agenda">
            <Agenda />
          </LayoutWrapper>
        }
      />

      <Route
        path="/DashboardPatrocinador"
        element={
          <LayoutWrapper currentPageName="DashboardPatrocinador">
            <DashboardPatrocinador />
          </LayoutWrapper>
        }
      />

      <Route
        path="/EntradaUnica"
        element={
          <LayoutWrapper currentPageName="EntradaUnica">
            <EntradaUnica />
          </LayoutWrapper>
        }
      />

      <Route
        path="/Mensagens"
        element={
          <LayoutWrapper currentPageName="Mensagens">
            <Mensagens />
          </LayoutWrapper>
        }
      />

      <Route
        path="/GuiaNotaFiscal"
        element={
          <LayoutWrapper currentPageName="GuiaNotaFiscal">
            <GuiaNotaFiscal />
          </LayoutWrapper>
        }
      />

      <Route
        path="/Aparencia"
        element={
          <LayoutWrapper currentPageName="Aparencia">
            <Aparencia />
          </LayoutWrapper>
        }
      />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <PatrocinadorViewProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>

          {/* ✅ PADRÃO GLOBAL DE TOAST - Sonner */}
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
  );
}

export default App;