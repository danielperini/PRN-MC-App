import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';

export default function BudgetSummary({ budgetLines = [], purchases = [] }) {
  const totalBudget = budgetLines.reduce((sum, line) => sum + (line.saldo_inicial || 0), 0);
  const totalCommitted = budgetLines.reduce((sum, line) => sum + (line.saldo_comprometido || 0), 0);
  const totalAvailable = totalBudget - totalCommitted;
  const executionPercent = totalBudget > 0 ? ((totalCommitted / totalBudget) * 100).toFixed(1) : 0;

  const stats = [
    {
      label: 'Orçamento Total',
      value: `R$ ${totalBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'blue',
    },
    {
      label: 'Comprometido',
      value: `R$ ${totalCommitted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: AlertTriangle,
      color: 'amber',
      subtext: `${executionPercent}% de execução`,
    },
    {
      label: 'Disponível',
      value: `R$ ${totalAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: CheckCircle,
      color: totalAvailable > 0 ? 'green' : 'red',
    },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <Card key={idx} className={`p-6 border ${colorMap[stat.color]}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold opacity-75 uppercase tracking-wide">{stat.label}</p>
                <p className="text-2xl font-bold mt-2">{stat.value}</p>
                {stat.subtext && <p className="text-xs mt-1 opacity-75">{stat.subtext}</p>}
              </div>
              <Icon className="w-8 h-8 opacity-40 flex-shrink-0" />
            </div>
          </Card>
        );
      })}
    </div>
  );
}