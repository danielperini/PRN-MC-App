import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
import AssistantChat from '@/components/chat/AssistantChat';
import MobileBottomTab from '@/components/mobile/MobileBottomTab';
import MobileHeader from '@/components/mobile/MobileHeader';

const PAGE_TITLES = {
  Dashboard: 'Painel',
  DashboardProfissional: 'Meu Painel',
  Relatorios: 'Ajuda, Plano de Trabalho e Relatórios',
  ReportEditor: 'Relatório',
  NovaAtividade: 'Atividades',
  CalendarioAtividades: 'Calendário',
  Compras: 'Suprimentos',
  GestaoPagamentos: 'Pagamentos',
  RelatorioMeta: 'Rel. por Meta',
  CoordReview: 'Revisão',
  UserManagement: 'Usuários',
  GestorArquivos: 'Arquivos',
  ActivityLog: 'Auditoria',
  PlataformaAdmin: 'Plataforma',
  AssistentePlanejamento: 'Assistente de IA do MC',
  Perfil: 'Perfil',
  BaseConhecimento: 'Conhecimento',
  LeitorNoticias: 'Notícias',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then(isAuth => {
      if (isAuth) base44.auth.me().then(setCurrentUser);
    });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar 
          currentPageName={currentPageName} 
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentUser={currentUser}
        />
      </div>

      {/* Main Content */}
      <div className={`hidden md:flex md:flex-col ${sidebarCollapsed ? 'ml-20' : 'ml-64'} min-h-screen transition-all duration-300`}>
        {/* Top Nav */}
        <TopNav currentUser={currentUser} />

        {/* Content */}
          <main className="flex-1 overflow-auto bg-white px-4 md:px-6">
            {children}
          </main>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col min-h-screen">
        <MobileHeader title={PAGE_TITLES[currentPageName] || 'Museus Centro'} />
        <main className="flex-1 overflow-auto bg-white pt-14 pb-16 animate-slide-in">
          {children}
        </main>
        <MobileBottomTab currentPageName={currentPageName} />
      </div>

      {/* Assistant Chat */}
      <AssistantChat />
    </div>
  );
}