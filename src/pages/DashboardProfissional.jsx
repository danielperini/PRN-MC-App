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
  const months = [...new Set(myReports.map((r) => `${r.mes_referencia}-${r.ano}`))];

  // Filtrar atividades
  const filteredActivities = myActivities.filter((activity) => {
    let match = true;

    if (selectedMuseum !== 'all') {
      const report = myReports.find((r) => r.id === activity.report_id);
      if (!report || report.museu !== selectedMuseum) match = false;
    }

    if (selectedStatus !== 'all') {
      const report = myReports.find((r) => r.id === activity.report_id);
      if (!report || report.status !== selectedStatus) match = false;
    }

    if (selectedMonth !== 'all' && activity.report_id) {
      const report = myReports.find((r) => r.id === activity.report_id);
      if (!report || `${report.mes_referencia}-${report.ano}` !== selectedMonth) match = false;
    }

    return match;
  });

  // Fotos das atividades
  const photos = myAttachments.filter((a) => a.file_type?.startsWith('image/'));

  return (
    <div className="space-y-6">
      






















































































































      
    </div>);

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
    enabled: !!currentUser?.email
  });

  const { data: myActivities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['my-activities-prof', currentUser?.email, myReports],
    queryFn: async () => {
      const activities = [];
      for (const report of myReports) {
        if (report.id && Array.isArray(report.atividades)) {
          activities.push(...report.atividades.map((a) => ({ ...a, report_id: report.id })));
        }
      }
      return activities;
    },
    enabled: !!currentUser?.email && myReports.length > 0
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
    enabled: myReports.length > 0
  });

  // Calcular estatísticas
  const stats = {
    total: myReports.length,
    rascunhos: myReports.filter((r) => r.status === 'DRAFT').length,
    aprovados: myReports.filter((r) => r.status === 'APPROVED').length,
    publico: myReports.reduce((sum, r) => {
      const atividades = Array.isArray(r.atividades) ? r.atividades : [];
      return sum + atividades.reduce((s, a) => {
        const repeticoes = a.quantas_repeticoes || 1;
        const est = a.publico_estimado || 0;
        return s + est * repeticoes;
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
              Painel
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
        {!isLoading &&
        <div className="mb-8 hidden">
            <h2 className="text-xl font-semibold text-foreground mb-4">Seu Desempenho</h2>
            <ProfessionalStats stats={stats} />
          </div>
        }

        {/* Relatórios Recentes */}
        {recentReports.length > 0 &&
        <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Relatórios Recentes</h2>
            <RecentReportsCard reports={recentReports} />
          </div>
        }

        {/* Seção de Dados Pessoais */}
        <ProfessionalDataSection
          currentUser={currentUser}
          myReports={myReports}
          myActivities={myActivities}
          myAttachments={myAttachments}
          isLoadingActivities={isLoadingActivities} />
        

        {/* Empty State */}
        {!isLoading && myReports.length === 0 &&
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
        }
      </div>
    </div>);

}

export default function DashboardProfissional() {
  return <RequireAuth><DashboardProfissionalInner /></RequireAuth>;
}