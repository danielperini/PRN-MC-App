import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, Users, Target, FileText } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import ExecutiveIndicators from '@/components/dashboard/ExecutiveIndicators';
import MetasAditivoSection from '@/components/dashboard/MetasAditivoSection';

function KpiCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

export default function AtividadesMetasTab({ targetEmail, userMuseum }) {
  const { data: userReports = [] } = useQuery({
    queryKey: ['user-reports-meusdados', targetEmail],
    queryFn: () => base44.entities.Report.filter({ created_by: targetEmail }, '-created_date', 50),
    enabled: !!targetEmail,
    staleTime: 120000,
  });

  const metrics = useDashboardMetrics(userReports, []);

  const totalAtividades = userReports.reduce((sum, r) => sum + (r.atividades?.length || 0), 0);

  const metasComAtividade = React.useMemo(() => {
    const metas = new Set();
    for (const r of userReports) {
      for (const a of (r.atividades || [])) {
        if (a.meta_codigo || a.meta_id) {
          metas.add(a.meta_codigo || a.meta_id);
        }
      }
    }
    return metas.size;
  }, [userReports]);

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Atividades" value={totalAtividades.toLocaleString('pt-BR')} icon={Activity} />
        <KpiCard label="Público" value={metrics.totalPublico.toLocaleString('pt-BR')} icon={Users} />
        <KpiCard label="Metas c/ Atividades" value={metasComAtividade.toLocaleString('pt-BR')} icon={Target} />
        <KpiCard label="Relatórios" value={userReports.length.toLocaleString('pt-BR')} icon={FileText} />
      </div>

      {/* Indicadores Executivos */}
      <div>
        <ExecutiveIndicators reports={userReports} rubricas={[]} />
      </div>

      {/* Metas do Museu */}
      <div>
        <MetasAditivoSection museuFiltro={userMuseum} />
      </div>
    </div>
  );
}