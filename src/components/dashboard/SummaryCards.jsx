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
    { label: 'Total de Atividades', value: totalActivities, icon: Activity },
    { label: 'Produtos Entregues', value: totalProducts, icon: Package },
    { label: 'Público Total', value: totalPublic.toLocaleString('pt-BR'), icon: Users },
    { label: 'Relatórios', value: safeReports.length, icon: Target },
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