import React from 'react';
import { Activity, Package, Users, Target } from 'lucide-react';

export default function SummaryCards({ reports = [] }) {
   // Calcular totais
   const safeReports = Array.isArray(reports) ? reports : [];
   const allActivities = safeReports.flatMap(r => {
     if (!r || !Array.isArray(r.atividades)) return [];
     return r.atividades;
   });
   const totalActivities = allActivities.length;
   const totalPublic = allActivities.reduce((sum, a) => {
     if (!a) return sum;
     const repeticoes = Number(a.quantas_repeticoes) || 1;
     const publico = Number(a.publico_estimado) || 0;
     return sum + (publico * repeticoes);
   }, 0);

   const totalProducts = allActivities.reduce((sum, a) => {
     if (!a) return sum;
     const produtos = Array.isArray(a.produtos_entregues) ? a.produtos_entregues.length : 0;
     const quantidade = Number(a.quantidade_produtos) || 0;
     return sum + produtos + quantidade;
   }, 0);

  const cards = [
    {
      label: 'Total de Atividades',
      value: totalActivities,
      icon: Activity,
      bg: 'bg-pink-50',
      border: 'border-pink-100',
      textColor: 'text-pink-700',
      iconColor: 'text-pink-400'
    },
    {
      label: 'Produtos Entregues',
      value: totalProducts,
      icon: Package,
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      textColor: 'text-amber-700',
      iconColor: 'text-amber-400'
    },
    {
      label: 'Público Total',
      value: totalPublic.toLocaleString('pt-BR'),
      icon: Users,
      bg: 'bg-cyan-50',
      border: 'border-cyan-100',
      textColor: 'text-cyan-700',
      iconColor: 'text-cyan-400'
    },
    {
      label: 'Relatórios',
      value: reports.length,
      icon: Target,
      bg: 'bg-purple-50',
      border: 'border-purple-100',
      textColor: 'text-purple-700',
      iconColor: 'text-purple-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`p-4 rounded-xl border ${card.bg} ${card.border}`}
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <p className={`text-2xl font-bold ${card.textColor}`}>
              {card.value}
            </p>
            <p className={`text-xs font-medium ${card.textColor} opacity-75 mt-1`}>
              {card.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}