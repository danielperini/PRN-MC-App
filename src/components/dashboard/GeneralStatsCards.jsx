import React from 'react';
import { BarChart3, Users, Target, CheckCircle, Calendar } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

export default function GeneralStatsCards({ reports = [] }) {
  const {
    museus,
    mediaPublicoPorAtividade,
    taxaPreenchimento,
    taxaAprovacao,
    periodosCobertos,
  } = useDashboardMetrics(reports, []);

  const stats = [
    { id: 'total_museus',      label: 'Museus Ativos',                     icon: BarChart3,    value: museus.size },
    { id: 'media_publico',     label: 'Público Médio/Atividade (aprovados)', icon: Users,       value: mediaPublicoPorAtividade },
    { id: 'taxa_preenchimento',label: 'Taxa de Preenchimento',              icon: Target,       value: taxaPreenchimento },
    { id: 'aprovacao_media',   label: 'Taxa de Aprovação',                  icon: CheckCircle,  value: taxaAprovacao },
    { id: 'meses_cobertos',    label: 'Períodos Cobertos',                  icon: Calendar,     value: periodosCobertos.size },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-black">Dados Gerais da Plataforma</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.id} className="p-4 border border-gray-200 rounded-xl bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-black">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}