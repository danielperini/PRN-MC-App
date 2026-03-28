import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';

import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PageNotFound from './lib/PageNotFound';
import { pagesConfig } from './pages.config';

const { Pages, Layout, mainPage } = pagesConfig;

const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

function LayoutWrapper({ children, currentPageName }) {
  if (!Layout) {
    return <>{children}</>;
  }

  return <Layout currentPageName={currentPageName}>{children}</Layout>;
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}

function AuthenticatedApp() {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
  } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingScreen />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }

    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LayoutWrapper currentPageName={mainPageKey}>
            {MainPage ? <MainPage /> : null}
          </LayoutWrapper>
        }
      />

      {Object.entries(Pages).map(([path, PageComponent]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <PageComponent />
            </LayoutWrapper>
          }
        />
      ))}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
