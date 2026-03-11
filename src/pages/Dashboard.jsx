import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, LayoutDashboard, User, RotateCw } from
'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CoordDashboard from '../components/dashboard/CoordDashboard';
import AdvancedFilters from '../components/dashboard/AdvancedFilters';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import WidgetCustomizer from '../components/dashboard/WidgetCustomizer';
import { useWidgetPreferences } from '../components/dashboard/useWidgetPreferences';
import ActivityMetricsWidget from '../components/dashboard/ActivityMetricsWidget';
import OpportunityMetricsWidget from '../components/dashboard/OpportunityMetricsWidget';
import UnifiedNewsCarousel from '../components/dashboard/UnifiedNewsCarousel';

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-white text-black border border-black', icon: Clock },
  SUBMITTED: { label: 'Enviado', color: 'bg-white text-black border border-black', icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-white text-black border border-black', icon: Eye },
  RETURNED: { label: 'Devolvido', color: 'bg-black text-white border border-black', icon: AlertCircle },
  APPROVED: { label: 'Aprovado', color: 'bg-black text-white border border-black', icon: CheckCircle },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-200 text-black border border-black', icon: Archive }
};

function DashboardInner() {
  const { user: currentUser, isLoading: userLoading, isCoordenador } = useCurrentUser();
  const { widgets, loaded: widgetsLoaded, toggleWidget, resetToDefault } = useWidgetPreferences();
  const [view, setView] = React.useState('coordenador');
  const [filters, setFilters] = React.useState({ museu: '', status: '' });
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Current month/year for compliance stats
  const now = new Date();
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  const { data: myReports = [], isLoading: loadingMy, refetch: refetchMy } = useQuery({
    queryKey: ['my-reports', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      const data = await base44.entities.Report.filter({ created_by: currentUser.email }, '-created_date');
      return Array.isArray(data) ? data : [];
    },
    enabled: !!currentUser?.email && !userLoading
  });

  const { data: allReports = [], isLoading: loadingAll, refetch: refetchAll } = useQuery({
    queryKey: ['all-reports'],
    queryFn: async () => {
      const data = await base44.entities.Report.list('-created_date', 200);
      return Array.isArray(data) ? data : [];
    },
    enabled: isCoordenador
  });

  // Subscrições em tempo real para atualizar números quando dados são excluídos/alterados
  React.useEffect(() => {
    const unsubReport = base44.entities.Report.subscribe(() => {
      refetchMy();
      if (isCoordenador) refetchAll();
    });
    const unsubActivity = base44.entities.Activity.subscribe(() => {
      refetchMy();
      if (isCoordenador) refetchAll();
    });
    return () => {
      unsubReport();
      unsubActivity();
    };
  }, [isCoordenador]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (showCoordView) {
        await refetchAll();
      } else {
        await refetchMy();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const showCoordView = isCoordenador && view === 'coordenador';
  const showDedicatedProfView = !isCoordenador;
  const displayReports = React.useMemo(() => {
    let reports = showCoordView ? allReports : myReports;
    if (!Array.isArray(reports)) return [];
    return reports;
  }, [showCoordView, allReports, myReports]);

  // Aplicar filtros
  const filteredReports = React.useMemo(() => {
    let reports = displayReports;
    if (filters.museu) {
      reports = reports.filter((r) => r.museu === filters.museu);
    }
    if (filters.status) {
      reports = reports.filter((r) => r.status === filters.status);
    }
    return reports;
  }, [displayReports, filters.museu, filters.status]);

  const recentReports = filteredReports.slice(0, 8);
  const isLoading = showCoordView ? loadingAll : loadingMy || userLoading;

  const stats = React.useMemo(() => {
    const total = filteredReports.length;
    const draft = filteredReports.filter((r) => r.status === 'DRAFT').length;
    const submitted = filteredReports.filter((r) => r.status === 'SUBMITTED').length;
    const inReview = filteredReports.filter((r) => r.status === 'IN_REVIEW').length;
    const approved = filteredReports.filter((r) => r.status === 'APPROVED').length;
    
    return [
      { label: 'Total', value: total },
      { label: 'Rascunhos', value: draft },
      { label: 'Enviados', value: submitted },
      { label: 'Em Revisão', value: inReview },
      { label: 'Aprovados', value: approved }
    ];
  }, [filteredReports]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">
              {showCoordView ? 'Painel da Coordenação' : 'Meu Painel'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {showCoordView
                ? 'Visão consolidada de todos os relatórios e atividades'
                : `Olá, ${currentUser?.full_name || ''}! Gerencie seus relatórios mensais.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!showCoordView && widgetsLoaded && (
              <WidgetCustomizer
                widgets={widgets}
                onToggleWidget={toggleWidget}
                onReset={resetToDefault}
              />
            )}
            {isCoordenador && (
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setView('coordenador')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === 'coordenador' ? 'bg-black text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />Coordenação
                </button>
                <button
                  onClick={() => setView('profissional')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === 'profissional' ? 'bg-black text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  <User className="w-3.5 h-3.5" />Meus Relatórios
                </button>
              </div>
            )}
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-gray-200"
              title="Atualizar dados dos últimos 30 dias"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Link to={createPageUrl('ReportEditor')}>
              <Button className="bg-black hover:bg-gray-800 text-white gap-2">
                <Plus className="w-4 h-4" />Novo Relatório
              </Button>
            </Link>
          </div>
        </div>

        {/* Painel Unificado de Destaques e Notícias */}
        <UnifiedNewsCarousel />

        {/* Coordenador: dashboard completo */}
         {showCoordView ? (
           <>
             <ComplianceStats currentMonth={currentMonth} currentYear={currentYear} />
             <CoordDashboard reports={allReports} isLoading={loadingAll} />
           </>
         ) : (
          <div>
            {/* Filtros */}
            <AdvancedFilters onFilterChange={setFilters} activeFilters={filters} />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              {stats.map(s => (
                <div key={s.label} className="p-4 border border-gray-200 rounded-xl">
                  <p className="text-2xl font-semibold text-black">{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Widgets Dinâmicos */}
            {widgetsLoaded && (
              <div className="space-y-8">
                {widgets.activityMetrics.enabled && (
                  <div>
                    <h2 className="text-lg font-medium text-black mb-4">{widgets.activityMetrics.title}</h2>
                    <ActivityMetricsWidget reports={filteredReports} />
                  </div>
                )}

                {widgets.opportunityMetrics.enabled && (
                  <div>
                    <h2 className="text-lg font-medium text-black mb-4">{widgets.opportunityMetrics.title}</h2>
                    <OpportunityMetricsWidget reports={filteredReports} />
                  </div>
                )}
              </div>
            )}

            {/* Recentes */}
            {widgets.recentReports.enabled && (
              <>
                <div className="flex items-center justify-between mb-4 mt-8">
                  <h2 className="text-lg font-medium text-black">{widgets.recentReports.title}</h2>
                  <Link to={createPageUrl('Relatorios')}>
                    <Button variant="ghost" size="sm" className="text-gray-500 gap-1">
                      Ver todos <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {isLoading ? (
                    <div className="col-span-full text-center py-20 text-gray-400">Carregando...</div>
                  ) : recentReports.length === 0 ? (
                    <div className="col-span-full text-center py-16 border border-dashed border-gray-200 rounded-2xl">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum relatório encontrado</p>
                      <Link to={createPageUrl('ReportEditor')}>
                        <Button variant="outline" className="mt-4 border-black">Criar primeiro relatório</Button>
                      </Link>
                    </div>
                  ) : (
                    recentReports.map(report => {
                      const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
                      const StatusIcon = cfg.icon;
                      const atividades = Array.isArray(report.atividades) ? report.atividades : [];
                      const nMeta = atividades.filter(a => a.classificacao === 'META').length;
                      const nRot  = atividades.filter(a => a.classificacao === 'ROTINA').length;
                      const nExt  = atividades.filter(a => a.classificacao === 'EXTRA').length;
                      return (
                        <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block group">
                          <div className="h-full p-5 rounded-2xl border-2 border-black hover:shadow-md transition-all bg-white">
                            <div className="flex items-center justify-between mb-4">
                              <Badge className={`${cfg.color} font-normal gap-1`}>
                                <StatusIcon className="w-3 h-3" />{cfg.label}
                              </Badge>
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                            </div>
                            <h3 className="font-semibold text-black text-base leading-tight">
                              {report.mes_referencia} {report.ano}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1 truncate">{report.author_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{report.museu}</p>
                            {(nMeta + nRot + nExt) > 0 && (
                              <div className="flex gap-1.5 mt-4 flex-wrap">
                                {nMeta > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-black text-black font-medium">{nMeta} Meta{nMeta > 1 ? 's' : ''}</span>}
                                {nRot > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-black text-black font-medium">{nRot} Rotina{nRot > 1 ? 's' : ''}</span>}
                                {nExt > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-black text-black font-medium">{nExt} Extra{nExt > 1 ? 's' : ''}</span>}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
















































































































































    </div>);

}

export default function Dashboard() {
  return <RequireAuth><DashboardInner /></RequireAuth>;
}