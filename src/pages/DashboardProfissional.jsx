import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Plus, BarChart3 } from 'lucide-react';
import ProfessionalStats from '../components/dashboard/ProfessionalStats';
import RecentReportsCard from '../components/dashboard/RecentReportsCard';

function DashboardProfissionalInner() {
  const { user: currentUser } = useCurrentUser();

  const { data: myReports = [], isLoading } = useQuery({
    queryKey: ['my-reports-prof', currentUser?.email],
    queryFn: () => base44.entities.Report.filter(
      { created_by: currentUser?.email }, 
      '-created_date',
      50
    ),
    enabled: !!currentUser?.email,
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
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">
              Painel do Profissional
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Olá, {currentUser?.full_name || ''}! Gerencie seus relatórios mensais
            </p>
          </div>
          <Link to={createPageUrl('ReportEditor')}>
            <Button className="bg-black hover:bg-gray-800 text-white gap-2">
              <Plus className="w-4 h-4" />Novo Relatório
            </Button>
          </Link>
        </div>

        {/* Statistics */}
        <div className="mb-10">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Carregando dados...</div>
          ) : (
            <ProfessionalStats stats={stats} />
          )}
        </div>

        {/* Recent Reports */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-black" />
            <h2 className="text-lg font-semibold text-black">Relatórios Recentes</h2>
          </div>
          <RecentReportsCard reports={recentReports} />
        </div>

        {/* Empty State */}
        {!isLoading && myReports.length === 0 && (
          <div className="p-12 text-center border border-dashed border-gray-200 rounded-2xl">
            <p className="text-gray-500 font-medium">Você ainda não tem relatórios</p>
            <p className="text-sm text-gray-400 mt-2">
              Comece criando um novo relatório mensal para registrar suas atividades
            </p>
            <Link to={createPageUrl('ReportEditor')}>
              <Button className="mt-6 bg-black hover:bg-gray-800 text-white gap-2">
                <Plus className="w-4 h-4" />Criar Primeiro Relatório
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