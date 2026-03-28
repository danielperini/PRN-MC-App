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
}
