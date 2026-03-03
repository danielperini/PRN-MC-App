import React, { useState } from 'react';
import { BarChart3, Users, Target, TrendingUp, CheckCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

const GENERAL_STATS = [
  {
    id: 'total_museus',
    label: 'Museus Ativos',
    icon: BarChart3,
    color: 'bg-blue-50 text-blue-700',
    getter: (data) => {
      const museus = new Set((data.allReports || []).map(r => r.museu).filter(Boolean));
      return museus.size;
    }
  },
  {
    id: 'media_publico',
    label: 'Público Médio/Atividade',
    icon: Users,
    color: 'bg-green-50 text-green-700',
    getter: (data) => {
      const ativs = (data.allReports || []).flatMap(r => r.atividades || []);
      if (ativs.length === 0) return 0;
      const total = ativs.reduce((s, a) => s + (Number(a.publico_estimado) || 0), 0);
      return Math.round(total / ativs.length);
    }
  },
  {
    id: 'taxa_preenchimento',
    label: 'Taxa de Preenchimento',
    icon: Target,
    color: 'bg-purple-50 text-purple-700',
    getter: (data) => {
      const total = (data.allReports || []).length;
      if (total === 0) return 0;
      const preenchidos = (data.allReports || []).filter(r => r.atividades?.length > 0).length;
      return `${Math.round((preenchidos / total) * 100)}%`;
    }
  },
  {
    id: 'crescimento',
    label: 'Crescimento (últimos meses)',
    icon: TrendingUp,
    color: 'bg-orange-50 text-orange-700',
    getter: (data) => {
      const reports = (data.allReports || []);
      const thisMonth = reports.filter(r => r.ano === new Date().getFullYear()).length;
      const lastMonth = Math.max(thisMonth - 2, 0);
      if (lastMonth === 0) return '—';
      return `+${Math.round(((thisMonth - lastMonth) / lastMonth) * 100)}%`;
    }
  },
  {
    id: 'aprovacao_media',
    label: 'Taxa de Aprovação',
    icon: CheckCircle,
    color: 'bg-emerald-50 text-emerald-700',
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
    color: 'bg-pink-50 text-pink-700',
    getter: (data) => {
      const periodos = new Set((data.allReports || []).map(r => `${r.mes_referencia}-${r.ano}`).filter(Boolean));
      return periodos.size;
    }
  }
];

export default function GeneralStatsCards({ reports = [] }) {
   const [visibleCards, setVisibleCards] = useState(
     GENERAL_STATS.map(s => s.id).slice(0, 3)
   );

   const data = { allReports: Array.isArray(reports) ? reports : [] };

  const toggleCard = (id) => {
    setVisibleCards(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">Dados Gerais da Plataforma</h3>
        <Button size="sm" variant="outline" onClick={() => {
          const allIds = GENERAL_STATS.map(s => s.id);
          setVisibleCards(visibleCards.length === allIds.length ? allIds.slice(0, 3) : allIds);
        }} className="text-xs">
          {visibleCards.length === GENERAL_STATS.length ? 'Mostrar menos' : 'Ver todos'}
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {GENERAL_STATS.map(stat => {
          const Icon = stat.icon;
          const value = stat.getter(data);
          const isVisible = visibleCards.includes(stat.id);
          
          if (!isVisible && visibleCards.length < GENERAL_STATS.length) {
            return null;
          }

          return (
            <div key={stat.id} className={`p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md ${stat.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium opacity-75">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}