import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
import AssistantChat from '@/components/chat/AssistantChat';
import MobileBottomTab from '@/components/mobile/MobileBottomTab';
import MobileHeader from '@/components/mobile/MobileHeader';
import { HelpContextProvider } from '@/components/help/HelpContextProvider';

const PAGE_TITLES = {
  Dashboard: 'Painel',
  DashboardProfissional: 'Meu Painel',
  DashboardFinanceiro: 'Dashboard Financeiro',
  RubricasPorMuseu: 'Rubricas por Museu',
  Relatorios: 'Relatórios',
  ReportEditor: 'Relatório',
  NovaAtividade: 'Atividades',
  CalendarioAtividades: 'Calendário',
  Compras: 'Compras e Pagamentos',
  GestaoPagamentos: 'Pagamentos',
  RelatorioMeta: 'Rel. por Meta',
  CoordReview: 'Revisão',
  UserManagement: 'Usuários',
  GestorArquivos: 'Arquivos',
  GaleriaFotos: 'Galeria de Fotos',
  ActivityLog: 'Auditoria',
  PlataformaAdmin: 'Plataforma',
  AssistentePlanejamento: 'Assistente de IA do MC',
  Perfil: 'Perfil',
  BaseConhecimento: 'Conhecimento',
  LeitorNoticias: 'Notícias',
  Manual: 'Manual e Ajuda',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then((isAuth) => {
      if (isAuth) base44.auth.me().then(setCurrentUser);
    });
  }, []);

  return (
    <HelpContextProvider>
      <div className="min-h-screen bg-white font-sans">
        {/* Desktop Sidebar */}
        <div className="hidden md:block border-r border-black/10">
          <Sidebar
            currentPageName={currentPageName}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            currentUser={currentUser}
          />
        </div>

        {/* Main Content */}
        <div
          className={`hidden md:flex md:flex-col ${
            sidebarCollapsed ? 'ml-20' : 'ml-64'
          } min-h-screen transition-all duration-300`}
        >
          {/* Top Nav */}
          <div className="border-b border-black/10">
            <TopNav currentUser={currentUser} />
          </div>

          {/* Content */}
          <main className="flex-1 overflow-auto bg-white px-4 md:px-6 py-6">
            {children}
          </main>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex flex-col min-h-screen bg-white font-sans">
          <div className="border-b border-black/10">
            <MobileHeader
              title={PAGE_TITLES[currentPageName] || 'Museus Centro'}
            />
          </div>
          <main className="flex-1 overflow-auto bg-white pt-14 pb-16 px-4 animate-slide-in">
            {children}
          </main>
          <MobileBottomTab currentPageName={currentPageName} />
        </div>

        {/* Assistant Chat */}
        <AssistantChat />
      </div>
    </HelpContextProvider>
  );
}
