import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "./Layout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import RelatorioMensal from "./pages/RelatorioMensal";
import AgendaMensal from "./pages/AgendaMensal";
import PublicAgenda from "./pages/PublicAgenda";
import CalendarioAtividades from "./pages/CalendarioAtividades";
import BaseConhecimento from "./pages/BaseConhecimento";
import DashboardBI from "./pages/DashboardBI";
import Financeiro from "./pages/Financeiro";
import AdminFinanceiro from "./pages/AdminFinanceiro";
import AdminVistoria from "./pages/AdminVistoria";
import AdminVistoriasBI from "./pages/AdminVistoriasBI";
import PaginaNaoEncontrada from "./pages/PaginaNaoEncontrada";
import RequireAuth from "./components/auth/RequireAuth";
import "./index.css";

export default function App() {
  return (
    <Router>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/agenda-publica" element={<PublicAgenda />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="RelatorioMensal" element={<RelatorioMensal />} />
          <Route path="AgendaMensal" element={<AgendaMensal />} />
          <Route path="CalendarioAtividades" element={<CalendarioAtividades />} />
          <Route path="BaseConhecimento" element={<BaseConhecimento />} />
          <Route path="DashboardBI" element={<DashboardBI />} />
          <Route path="Financeiro" element={<Financeiro />} />
          <Route path="AdminFinanceiro" element={<AdminFinanceiro />} />
          <Route path="AdminVistoria" element={<AdminVistoria />} />
          <Route path="AdminVistoriasBI" element={<AdminVistoriasBI />} />
        </Route>

        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<PaginaNaoEncontrada />} />
      </Routes>
    </Router>
  );
}      </div>
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

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

function App() {
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

export default App;
