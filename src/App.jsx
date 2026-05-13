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
import DashboardPatrocinador from './pages/DashboardPatrocinadorSync';
import EntradaUnica from './pages/EntradaUnica.jsx';
import Mensagens from './pages/Mensagens.jsx';
import GuiaNotaFiscal from './pages/GuiaNotaFiscal';
import ConviteAcesso from './pages/ConviteAcesso';
import NFDriveBackupSyncInstaller from '@/lib/nfDriveBackupSync';
import PublicoAprovadoAuditButton from '@/components/dashboard/PublicoAprovadoAuditButton';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo AppErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white border border-red-100 rounded-2xl shadow-sm p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 text-xl font-bold">
            !
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Não foi possível abrir esta página</h1>
            <p className="mt-2 text-sm text-slate-600">
              O sistema encontrou um erro nesta tela e impediu a página branca. Tente recarregar ou voltar ao painel.
            </p>
          </div>
          {this.state.error?.message && (
            <div className="text-left bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-500 break-words">
              {String(this.state.error.message)}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Recarregar página
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Voltar ao painel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

function SafePage({ Page, pageName }) {
  if (!Page) {
    return (
      <LayoutWrapper currentPageName={pageName}>
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md w-full border border-amber-200 bg-amber-50 rounded-2xl p-5 text-center text-amber-800">
            <h1 className="text-lg font-semibold">Página não registrada corretamente</h1>
            <p className="mt-2 text-sm">A rota existe, mas o componente da página não foi carregado.</p>
          </div>
        </div>
      </LayoutWrapper>
    );
  }

  return (
    <AppErrorBoundary key={pageName}>
      <LayoutWrapper currentPageName={pageName}>
        <Page />
      </LayoutWrapper>
    </AppErrorBoundary>
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

            <Route path="/ChecklistProducao" element={<SafePage Page={ChecklistProducao} pageName="ChecklistProducao" />} />
            <Route path="/RubricasPorMuseu" element={<SafePage Page={RubricasPorMuseu} pageName="RubricasPorMuseu" />} />
            <Route path="/BaseConhecimento" element={<SafePage Page={BaseConhecimento} pageName="BaseConhecimento" />} />
            <Route path="/ProgramacaoEspelho" element={<SafePage Page={ProgramacaoEspelho} pageName="ProgramacaoEspelho" />} />
            <Route path="/Agenda" element={<SafePage Page={Agenda} pageName="Agenda" />} />
            <Route path="/DashboardPatrocinador" element={<SafePage Page={DashboardPatrocinador} pageName="DashboardPatrocinador" />} />
            <Route path="/EntradaUnica" element={<SafePage Page={EntradaUnica} pageName="EntradaUnica" />} />
            <Route path="/Mensagens" element={<SafePage Page={Mensagens} pageName="Mensagens" />} />
            <Route path="/GuiaNotaFiscal" element={<SafePage Page={GuiaNotaFiscal} pageName="GuiaNotaFiscal" />} />
            <Route path="/Aparencia" element={<SafePage Page={Aparencia} pageName="Aparencia" />} />
            <Route path="/ConviteAcesso" element={<ConviteAcesso />} />

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PatrocinadorViewProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AppErrorBoundary>
                <AuthenticatedApp />
              </AppErrorBoundary>
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
  );
}

export default App;