import React from 'react';
import { Activity, Package, Users, Target } from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

export default function SummaryCards({ reports = [] }) {
  const {
    totalAtividades,
    totalProdutos,
    totalPublico,
    totalRelatoriosAprovados,
  } = useDashboardMetrics(reports, []);

  const cards = [
    { label: 'Atividades (aprovados)', value: totalAtividades, icon: Activity },
    { label: 'Produtos Entregues', value: totalProdutos, icon: Package },
    { label: 'Público Total (aprovados)', value: totalPublico.toLocaleString('pt-BR'), icon: Users },
    { label: 'Relatórios Aprovados', value: totalRelatoriosAprovados, icon: Target },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="p-4 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between mb-3">
              <Icon className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-black">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}