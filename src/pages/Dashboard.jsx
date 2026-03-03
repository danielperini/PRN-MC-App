import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  FileText, Plus, Clock, CheckCircle, AlertCircle,
  Send, Eye, Archive, ChevronRight, LayoutDashboard, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CoordDashboard from '../components/dashboard/CoordDashboard';
import AdvancedFilters from '../components/dashboard/AdvancedFilters';
import HighlightsCard from '../components/dashboard/HighlightsCard';
import SummaryCards from '../components/dashboard/SummaryCards';
import GeneralStatsCards from '../components/dashboard/GeneralStatsCards';
import TrendChart from '../components/dashboard/TrendChart';
import ComplianceStats from '../components/dashboard/ComplianceStats';
import ExemptionManager from '../components/dashboard/ExemptionManager';

const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   color: 'bg-gray-100 text-gray-600',      cardBg: 'bg-white',            icon: Clock },
  SUBMITTED: { label: 'Enviado',    color: 'bg-blue-100 text-blue-700',      cardBg: 'bg-blue-50/40',       icon: Send },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700',    cardBg: 'bg-amber-50/40',      icon: Eye },
  RETURNED:  { label: 'Devolvido',  color: 'bg-red-100 text-red-700',        cardBg: 'bg-red-50/40',        icon: AlertCircle },
  APPROVED:  { label: 'Aprovado',   color: 'bg-emerald-100 text-emerald-700', cardBg: 'bg-emerald-50/40',   icon: CheckCircle },
  ARCHIVED:  { label: 'Arquivado',  color: 'bg-purple-100 text-purple-700',  cardBg: 'bg-purple-50/30',     icon: Archive },
};

function DashboardInner() {
  const { user: currentUser, isLoading: userLoading, isCoordenador } = useCurrentUser();
   const [view, setView] = React.useState('coordenador'); 
   const [filters, setFilters] = React.useState({ museu: '', status: '' });

   // Current month/year for compliance stats
   const now = new Date();
   const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
   const currentMonth = monthNames[now.getMonth()];
   const currentYear = now.getFullYear();

   const { data: myReports = [], isLoading: loadingMy } = useQuery({
      queryKey: ['my-reports', currentUser?.email],
      queryFn: async () => {
        if (!currentUser?.email) return [];
        const data = await base44.entities.Report.filter({ created_by: currentUser.email }, '-created_date');
        return Array.isArray(data) ? data : [];
      },
      enabled: !!currentUser?.email && !userLoading,
    });

   const { data: allReports = [], isLoading: loadingAll } = useQuery({
      queryKey: ['all-reports'],
      queryFn: async () => {
        const data = await base44.entities.Report.list('-created_date', 200);
        return Array.isArray(data) ? data : [];
      },
      enabled: isCoordenador,
    });

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
       reports = reports.filter(r => r.museu === filters.museu);
     }
     if (filters.status) {
       reports = reports.filter(r => r.status === filters.status);
     }
     return reports;
   }, [displayReports, filters.museu, filters.status]);

   const recentReports = filteredReports.slice(0, 8);
   const isLoading = showCoordView ? loadingAll : loadingMy || userLoading;

  const stats = React.useMemo(() => [
    { label: 'Total',       value: filteredReports.length },
    { label: 'Rascunhos',   value: filteredReports.filter(r => r.status === 'DRAFT').length },
    { label: 'Enviados',    value: filteredReports.filter(r => r.status === 'SUBMITTED').length },
    { label: 'Em Revisão',  value: filteredReports.filter(r => r.status === 'IN_REVIEW').length },
    { label: 'Aprovados',   value: filteredReports.filter(r => r.status === 'APPROVED').length },
  ], [filteredReports]);

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
            <Link to={createPageUrl('ReportEditor')}>
              <Button className="bg-black hover:bg-gray-800 text-white gap-2">
                <Plus className="w-4 h-4" />Novo Relatório
              </Button>
            </Link>
          </div>
        </div>

        {/* Fatos Marcantes — visível para todos */}
         <div className="mb-10">
           <HighlightsCard />
         </div>

         {/* Summary Cards — visível para todos */}
         <div className="mb-10">
           <SummaryCards reports={filteredReports} />
         </div>

         {/* General Stats Cards — visível para todos */}
          <div className="mb-10">
            <GeneralStatsCards reports={filteredReports} />
          </div>

         {/* Coordenador: dashboard completo */}
          {showCoordView ? (
            <>
              <ComplianceStats currentMonth={currentMonth} currentYear={currentYear} />
              <ExemptionManager currentMonth={currentMonth} currentYear={currentYear} />
              <CoordDashboard reports={allReports} isLoading={loadingAll} />
            </>
           ) : showDedicatedProfView ? (
             <div>
               {/* Redirect message */}
               <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                 <p className="text-sm text-blue-800">
                   Para um painel simplificado, acesse o <Link to={createPageUrl('DashboardProfissional')} className="font-semibold hover:underline">Painel do Profissional</Link>
                 </p>
               </div>

               {/* Filtros Avançados */}
               <AdvancedFilters onFilterChange={setFilters} activeFilters={filters} />

               {/* Status Stats — profissional */}
               <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                 {stats.map(s => (
                   <div key={s.label} className="p-4 border border-gray-100 rounded-xl">
                     <p className="text-2xl font-semibold text-black">{s.value}</p>
                     <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                   </div>
                 ))}
               </div>

               {/* Recentes */}
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-lg font-medium text-black">Relatórios Recentes</h2>
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
                         <div className={`h-full p-5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all ${cfg.cardBg}`}>
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
                               {nMeta > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{nMeta} Meta{nMeta > 1 ? 's' : ''}</span>}
                               {nRot > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">{nRot} Rotina{nRot > 1 ? 's' : ''}</span>}
                               {nExt > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{nExt} Extra{nExt > 1 ? 's' : ''}</span>}
                             </div>
                           )}
                         </div>
                       </Link>
                     );
                   })
                 )}
               </div>
             </div>
           ) : (
             <>
               {/* Filtros Avançados */}
               <AdvancedFilters onFilterChange={setFilters} activeFilters={filters} />

               {/* Status Stats — profissional */}
               <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                 {stats.map(s => (
                   <div key={s.label} className="p-4 border border-gray-100 rounded-xl">
                     <p className="text-2xl font-semibold text-black">{s.value}</p>
                     <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                   </div>
                 ))}
               </div>

               {/* Recentes */}
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-lg font-medium text-black">Relatórios Recentes</h2>
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
                         <div className={`h-full p-5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all ${cfg.cardBg}`}>
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
                               {nMeta > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{nMeta} Meta{nMeta > 1 ? 's' : ''}</span>}
                               {nRot > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">{nRot} Rotina{nRot > 1 ? 's' : ''}</span>}
                               {nExt > 0  && <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{nExt} Extra{nExt > 1 ? 's' : ''}</span>}
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
    </div>
  );
}

export default function Dashboard() {
  return <RequireAuth><DashboardInner /></RequireAuth>;
}