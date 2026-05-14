import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Filter, X } from 'lucide-react';
import GaleriaTickerCarousel from '../components/dashboard/GaleriaTickerCarousel';
import DiariamenteNosMuseus from '../components/dashboard/DiariamenteNosMuseus';
import DashboardPatrocinador from './DashboardPatrocinador';
import ProfessionalStats from '../components/dashboard/ProfessionalStats';
import RecentReportsCard from '../components/dashboard/RecentReportsCard';

function ProfessionalDataSection({ currentUser, myReports, myActivities, myAttachments, isLoadingActivities }) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMuseum, setSelectedMuseum] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');

  // Obter museus únicos
  const museums = ['MHAB', 'MIS', 'MUMO'];

  // Obter meses únicos dos relatórios
  const months = [...new Set(myReports.map(r => `${r.mes_referencia}-${r.ano}`))];

  // Filtrar atividades
  const filteredActivities = myActivities.filter(activity => {
    let match = true;
    
    if (selectedMuseum !== 'all') {
      const report = myReports.find(r => r.id === activity.report_id);
      if (!report || report.museu !== selectedMuseum) match = false;
    }
    
    if (selectedStatus !== 'all') {
      const report = myReports.find(r => r.id === activity.report_id);
      if (!report || report.status !== selectedStatus) match = false;
    }

    if (selectedMonth !== 'all' && activity.report_id) {
      const report = myReports.find(r => r.id === activity.report_id);
      if (!report || `${report.mes_referencia}-${report.ano}` !== selectedMonth) match = false;
    }

    return match;
  });

  // Fotos das atividades
  const photos = myAttachments.filter(a => a.file_type?.startsWith('image/'));

  return (
    <div className="space-y-6">
      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Meus Dados e Atividades</h2>
            <p className="text-sm text-muted-foreground mt-1">Visualize suas atividades, relatórios e documentos</p>
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Ocultar' : 'Filtros'}
          </Button>
        </div>

        {/* Filtros */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-secondary rounded-lg mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Museu</label>
              <select
                value={selectedMuseum}
                onChange={(e) => setSelectedMuseum(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="all">Todos os museus</option>
                {museums.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="all">Todos</option>
                <option value="DRAFT">Rascunho</option>
                <option value="SUBMITTED">Enviado</option>
                <option value="APPROVED">Aprovado</option>
                <option value="ARCHIVED">Arquivado</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Período</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
              >
                <option value="all">Todos os períodos</option>
                {months.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Cards de Dados Pessoais */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
            <div className="text-sm text-muted-foreground mb-1">Minhas Atividades</div>
            <div className="text-2xl font-bold text-foreground">{filteredActivities.length}</div>
            <div className="text-xs text-muted-foreground mt-2">registradas</div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
            <div className="text-sm text-muted-foreground mb-1">Relatórios Enviados</div>
            <div className="text-2xl font-bold text-foreground">{myReports.filter(r => r.status !== 'DRAFT').length}</div>
            <div className="text-xs text-muted-foreground mt-2">de {myReports.length}</div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
            <div className="text-sm text-muted-foreground mb-1">Relatórios Aprovados</div>
            <div className="text-2xl font-bold text-foreground">{myReports.filter(r => r.status === 'APPROVED').length}</div>
            <div className="text-xs text-muted-foreground mt-2">pelo coordenador</div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
            <div className="text-sm text-muted-foreground mb-1">Fotos Vinculadas</div>
            <div className="text-2xl font-bold text-foreground">{photos.length}</div>
            <div className="text-xs text-muted-foreground mt-2">nas atividades</div>
          </div>
        </div>

        {/* Seção de Atividades */}
        {!isLoadingActivities && filteredActivities.length > 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Atividades Registradas</h3>
              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {filteredActivities.slice(0, 10).map((activity) => {
                  const report = myReports.find(r => r.id === activity.report_id);
                  return (
                    <div key={activity.id} className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
                      <div className="font-medium text-sm text-foreground">{activity.titulo}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {report?.museu || 'Geral'} • {report?.mes_referencia} {report?.ano}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isLoadingActivities && filteredActivities.length === 0 && (
          <div className="p-8 text-center border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground">Nenhuma atividade encontrada com os filtros selecionados</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardProfissionalInner() {
  const { user: currentUser } = useCurrentUser();

  const { data: myReports = [], isLoading } = useQuery({
    queryKey: ['my-reports-prof', currentUser?.email],
    queryFn: () => base44.entities.Report.filter(
      { created_by: currentUser?.email }, 
      '-created_date',
      100
    ),
    enabled: !!currentUser?.email,
  });

  const { data: myActivities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['my-activities-prof', currentUser?.email, myReports],
    queryFn: async () => {
      const activities = [];
      for (const report of myReports) {
        if (report.id && Array.isArray(report.atividades)) {
          activities.push(...report.atividades.map(a => ({ ...a, report_id: report.id })));
        }
      }
      return activities;
    },
    enabled: !!currentUser?.email && myReports.length > 0,
  });

  const { data: myAttachments = [] } = useQuery({
    queryKey: ['my-attachments-prof', myReports],
    queryFn: async () => {
      const attachments = [];
      for (const report of myReports) {
        try {
          const reportAttachments = await base44.entities.Attachment.filter(
            { report_id: report.id },
            '-created_date'
          );
          attachments.push(...reportAttachments);
        } catch (e) {
          console.warn('Error fetching attachments:', e);
        }
      }
      return attachments;
    },
    enabled: myReports.length > 0,
  });

  // Calcular estatísticas
  const stats = {
    total: myReports.length,
    rascunhos: myReports.filter(r => r.status === 'DRAFT').length,
    aprovados: myReports.filter(r => r.status === 'APPROVED').length,
    publico: myReports.reduce((sum, r) => {
      const atividades = Array.isArray(r.atividades) ? r.atividades : [];
      return sum + atividades.reduce((s, a) => {
        const repeticoes = a.quantas_repeticoes || 1;
        const est = a.publico_estimado || 0;
        return s + (est * repeticoes);
      }, 0);
    }, 0)
  };

  const recentReports = myReports.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">
              Painel do Profissional
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bem-vindo, {currentUser?.full_name || ''}! Sua atuação nas instituições
            </p>
          </div>
          <Link to="/ReportEditor">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Relatório
            </Button>
          </Link>
        </div>

        {/* Seção Institucional */}
        <div className="space-y-6 mb-6">
          <GaleriaTickerCarousel />
          <DiariamenteNosMuseus />
          <DashboardPatrocinador />
        </div>

        {/* Estatísticas Pessoais */}
        {!isLoading && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Seu Desempenho</h2>
            <ProfessionalStats stats={stats} />
          </div>
        )}

        {/* Relatórios Recentes */}
        {recentReports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Relatórios Recentes</h2>
            <RecentReportsCard reports={recentReports} />
          </div>
        )}

        {/* Seção de Dados Pessoais */}
        <ProfessionalDataSection
          currentUser={currentUser}
          myReports={myReports}
          myActivities={myActivities}
          myAttachments={myAttachments}
          isLoadingActivities={isLoadingActivities}
        />

        {/* Empty State */}
        {!isLoading && myReports.length === 0 && (
          <div className="p-12 text-center border border-dashed border-border rounded-2xl mt-8">
            <p className="text-foreground font-medium">Você ainda não tem relatórios</p>
            <p className="text-sm text-muted-foreground mt-2">
              Comece criando um novo relatório mensal para registrar suas atividades e atuação
            </p>
            <Link to="/ReportEditor">
              <Button className="mt-6 gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeiro Relatório
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardProfissional() {
  return <RequireAuth><DashboardProfissionalInner /></RequireAuth>;
}