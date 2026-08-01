import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from '@/components/layout/Sidebar';
import TopNav from '@/components/layout/TopNav';
import AssistantChat from '@/components/chat/AssistantChat';
import MobileBottomTab from '@/components/mobile/MobileBottomTab';
import MobileHeader from '@/components/mobile/MobileHeader';
import { HelpContextProvider } from '@/components/help/HelpContextProvider';
import GlobalAnnouncementBanner from '@/components/common/GlobalAnnouncementBanner';
import SystemBannerDisplay from '@/components/mensagens/SystemBannerDisplay';
import AutoRubricasSync from '@/components/compras/AutoRubricasSync';
import AutoNotasDriveSync from '@/components/movimentacoes/AutoNotasDriveSync';
import AutoContratosDriveSync from '@/components/contratos/AutoContratosDriveSync';
import { RotateCw } from 'lucide-react';

const PAGE_TITLES = {
  Dashboard: 'Painel',
  DashboardProfissional: 'Meu Painel',
  DashboardFinanceiro: 'Dashboard Financeiro',
  DashboardPatrocinador: 'Painel',
  RubricasPorMuseu: 'Orçamento',
  Relatorios: 'Relatórios',
  ReportEditor: 'Relatório',
  NovaAtividade: 'Atividades',
  Compras: 'Compras',
  GestaoPagamentos: 'Pagamentos',
  RelatorioMeta: 'Rel. por Meta',
  CoordReview: 'Revisão de Relatórios',
  UserManagement: 'Usuários',
  GestorArquivos: 'Arquivos',
  GaleriaFotos: 'Galeria',
  ComunicacaoVisibilidade: 'Comunicação',
  ActivityLog: 'Auditoria',
  PlataformaAdmin: 'Administração do Sistema',
  AssistentePlanejamento: 'Assistente de IA do MC',
  Perfil: 'Perfil',
  BaseConhecimento: 'Base de Conhecimento',
  LeitorNoticias: 'Notícias',
  Manual: 'Ajuda',
  Tutoriais: 'Tutoriais em Vídeo',
  GeradorListaPresenca: 'Gerador de Lista de Presença',
  GeradorTermoCompromisso: 'Gerador de Termo de Compromisso',
  MeusDados: 'Espaço do Usuário',
  Equipe: 'Equipe',
  ProgramacaoEspelho: 'Programação',
  Agenda: 'Agenda',
  EntradaUnica: 'Entrada de Documentos',
  Mensagens: 'Mensagens',
  Aparencia: 'Aparência',
  RelatorioExecucaoObjeto: 'Execução do Objeto',
  VarreduraDrive: 'Varredura do Google Drive',
  AuditoriaMensalRubricas: 'Auditoria de Gastos vs. Metas',
  NFsDoGmail: 'NFs do Gmail',
  RelatorioFisicoFinanceiro: 'Relatório Físico-Financeiro',
  RelatorioFisicoFinanceiroRevisao: 'Revisão e Aprovação do Relatório',
  Movimentacoes: 'Movimentações',
  AprovacaoNFs: 'Aprovação de NFs',
  ChecklistProducao: 'Checklist de Produção',
  GaleriaNoturno: '🌙 Galeria Noturno nos Museus',
  RelatorioAtividadesFotos: 'Relatórios de Atividades',
  RelatorioAtividadesHtml: 'Relatório de Atividades com Fotos',
  BancoRelatorios: 'Banco de Relatórios',
  AuditoriaInstitucional: 'Auditoria Institucional',
  AcervoLinks: 'Acervo de Links',
  Movimentacoes: 'Movimentações Bancárias',
  AprovacaoNFs: 'Aprovação de Notas Fiscais',
  VarreduraDrive: 'Varredura do Google Drive',
  AuditoriaMensalRubricas: 'Auditoria de Gastos vs. Metas',
  NFsDoGmail: 'Notas Fiscais do Gmail',
  RelatorioExecucaoObjeto: 'Relatório de Execução do Objeto',
  RelatorioAtividadesFotos: 'Relatório de Atividades com Fotos',
  GaleriaNoturno: 'Galeria Noturno nos Museus',
  ImportarNoturno2026: 'Importar Programação Noturno 2026',
  CorrecaoRubricasAdmin: 'Correção de Rubricas',
  CorrecaoRubricasDuplicadas: 'Rubricas Duplicadas',
  RelatorioExecucaoDashboard: 'Dashboard de Execução',
};

export default function Layout({ children, currentPageName }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const mobileMainRef = useRef(null);
  const queryClient = useQueryClient();

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
    return () => { active = false; };
  }, []);

  const pageTitle = PAGE_TITLES[currentPageName] || 'Museus Centro';

  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries({ stale: true });
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  useEffect(() => {
    const container = mobileMainRef.current;
    if (!container) return;
    const handleTouchStart = (event) => { startYRef.current = event.touches[0].clientY; };
    const handleTouchMove = (event) => {
      const currentY = event.touches[0].clientY;
      const scrollTop = container.scrollTop;
      if (scrollTop === 0) {
        const distance = currentY - startYRef.current;
        if (distance > 0) setPullDistance(Math.min(distance * 0.5, 120));
      }
    };
    const handleTouchEnd = () => {
      if (pullDistance >= 80) handlePullToRefresh();
      setPullDistance(0);
    };
    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance]);

  return (
    <HelpContextProvider pageName={currentPageName}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {currentUser && <AutoRubricasSync />}
        {currentUser && <AutoNotasDriveSync />}
        {currentUser && <AutoContratosDriveSync currentUser={currentUser} />}
        <GlobalAnnouncementBanner />
        <SystemBannerDisplay />
        <div className="hidden lg:flex min-h-screen items-stretch">
          <Sidebar currentPageName={currentPageName} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} currentUser={currentUser} />
          <div className="flex-1 min-w-0 flex flex-col">
            <TopNav title={pageTitle} currentPageName={currentPageName} currentUser={currentUser} />
            <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">{children}</main>
          </div>
        </div>
        <div className="lg:hidden min-h-screen flex flex-col pb-20">
          <MobileHeader title={pageTitle} currentPageName={currentPageName} currentUser={currentUser} />
          <main ref={mobileMainRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 relative">
            {pullDistance > 0 && (
              <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center bg-gradient-to-b from-blue-50 to-transparent transition-all" style={{ height: `${pullDistance}px` }}>
                {pullDistance >= 80 ? (
                  <div className="flex flex-col items-center gap-1">
                    <RotateCw className={`w-4 h-4 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <p className="text-xs text-blue-600 font-medium">{isRefreshing ? 'Atualizando...' : 'Solte para atualizar'}</p>
                  </div>
                ) : <p className="text-xs text-blue-500">Puxe para atualizar</p>}
              </div>
            )}
            <div>{children}</div>
          </main>
          <MobileBottomTab currentPageName={currentPageName} />
        </div>
        <AssistantChat />
      </div>
    </HelpContextProvider>
  );
}