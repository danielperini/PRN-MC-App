import React, { useEffect, useState } from 'react';
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
  GeradorListaPresenca: 'Gerador de Lista de Presença',
  GeradorTermoCompromisso: 'Gerador de Termo de Compromisso',
  MeusDados: 'Meus Dados',
  ProgramacaoEspelho: 'Programação — Espelho da Planilha',
  Agenda: 'Agenda Museu Centro',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) {
          if (active) setCurrentUser(null);
          return;
        }

        const user = await base44.auth.me();
        if (active) setCurrentUser(user || null);
      } catch (error) {
        console.error('Erro ao carregar usuário no layout:', error);
        if (active) setCurrentUser(null);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  const pageTitle = PAGE_TITLES[currentPageName] || 'Museus Centro';

  return (
    <HelpContextProvider pageName={currentPageName}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="hidden lg:flex min-h-screen items-stretch">
          <Sidebar
            currentPageName={currentPageName}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((prev) => !prev)}
            currentUser={currentUser}
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <TopNav
              title={pageTitle}
              currentPageName={currentPageName}
              currentUser={currentUser}
            />

            <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>

        <div className="lg:hidden min-h-screen flex flex-col pb-20">
          <MobileHeader
            title={pageTitle}
            currentPageName={currentPageName}
            currentUser={currentUser}
          />

          <main className="flex-1 min-w-0 overflow-x-hidden p-4">
            {children}
          </main>

          <MobileBottomTab currentPageName={currentPageName} />
        </div>

        <AssistantChat />
      </div>
    </HelpContextProvider>
  );
}