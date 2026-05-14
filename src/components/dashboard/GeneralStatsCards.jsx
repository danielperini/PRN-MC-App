import React from 'react';
import { BarChart3, Users, Target, CheckCircle, Calendar } from 'lucide-react';

const GENERAL_STATS = [
  {
    id: 'total_museus',
    label: 'Museus Ativos',
    icon: BarChart3,
    getter: (data) => {
      const museus = new Set((data.allReports || []).map(r => r.museu).filter(Boolean));
      return museus.size;
    }
  },
  {
    id: 'media_publico',
    label: 'Público Médio/Atividade (aprovados)',
    icon: Users,
    getter: (data) => {
      const approved = (data.allReports || []).filter(r => r.status === 'APPROVED');
      const ativs = approved.flatMap(r => r.atividades || []);
      // REGRA: só considerar atividades com público efetivamente preenchido (> 0)
      const comPublico = ativs.filter(a => {
        const pt = Number(a.publico_total ?? 0);
        const pe = Number(a.publico_estimado ?? 0);
        return pt > 0 || pe > 0;
      });
      if (comPublico.length === 0) return 0;
      const total = comPublico.reduce((s, a) => {
        const pt = Number(a.publico_total ?? 0);
        if (pt > 0) return s + pt;
        const pe = Number(a.publico_estimado ?? 0);
        const reps = Number(a.quantas_repeticoes ?? 1);
        return s + pe * Math.max(reps, 1);
      }, 0);
      return Math.round(total / comPublico.length);
    }
  },
  {
    id: 'taxa_preenchimento',
    label: 'Taxa de Preenchimento',
    icon: Target,
    getter: (data) => {
      const total = (data.allReports || []).length;
      if (total === 0) return 0;
      const preenchidos = (data.allReports || []).filter(r => r.atividades?.length > 0).length;
      return `${Math.round((preenchidos / total) * 100)}%`;
    }
  },
  {
    id: 'aprovacao_media',
    label: 'Taxa de Aprovação',
    icon: CheckCircle,
    getter: (data) => {
      const total = (data.allReports || []).length;
      if (total === 0) return 0;
      const aprovados = (data.allReports || []).filter(r => r.status === 'APPROVED').length;
      return `${Math.round((aprovados / total) * 100)}%`;
    }
  },
  {
    id: 'meses_cobertos',
    label: 'Períodos Cobertos',
    icon: Calendar,
    getter: (data) => {
      const periodos = new Set((data.allReports || []).map(r => `${r.mes_referencia}-${r.ano}`).filter(Boolean));
      return periodos.size;
    }
  }
];

export default function GeneralStatsCards({ reports = [] }) {
   const data = { allReports: Array.isArray(reports) ? reports : [] };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-black">Dados Gerais da Plataforma</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {GENERAL_STATS.map(stat => {
          const Icon = stat.icon;
          const value = stat.getter(data);
          return (
            <div key={stat.id} className="p-4 border border-gray-200 rounded-xl bg-white">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-black">{value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}