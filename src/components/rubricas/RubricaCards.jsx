import React, { useMemo } from 'react';
import { DollarSign, AlertCircle, TrendingUp } from 'lucide-react';

export default function RubricaCards({ rubricas }) {
  const totais = useMemo(() => {
    const ativas = rubricas.filter(r => r.ativo);
    return {
      total_rubricas: ativas.length,
      total_previsto: ativas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0),
      total_utilizado: ativas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0),
      saldo_total: ativas.reduce((sum, r) => sum + ((r.saldo || 0)), 0),
    };
  }, [rubricas]);

  const percentualGeral = totais.total_previsto > 0
    ? Math.round((totais.total_utilizado / totais.total_previsto) * 100)
    : 0;

  const cards = [
    {
      label: 'Total de Rubricas',
      valor: totais.total_rubricas,
      formato: 'numero',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      icon: DollarSign,
    },
    {
      label: 'Total Previsto',
      valor: totais.total_previsto,
      formato: 'moeda',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
      icon: TrendingUp,
    },
    {
      label: 'Total Utilizado',
      valor: totais.total_utilizado,
      formato: 'moeda',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-700',
      borderColor: 'border-orange-200',
      icon: AlertCircle,
    },
    {
      label: 'Saldo Total',
      valor: totais.saldo_total,
      formato: 'moeda',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      icon: DollarSign,
    },
    {
      label: '% Geral Utilizado',
      valor: percentualGeral,
      formato: 'percentual',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
      icon: TrendingUp,
    },
  ];

  const formatarValor = (valor, tipo) => {
    if (tipo === 'moeda') {
      return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (tipo === 'percentual') {
      return `${valor}%`;
    }
    return valor;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`border rounded-lg p-4 ${card.bgColor} ${card.borderColor}`}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">{card.label}</span>
              <Icon className={`w-4 h-4 ${card.textColor}`} />
            </div>
            <p className={`text-lg md:text-xl font-bold ${card.textColor}`}>
              {formatarValor(card.valor, card.formato)}
            </p>
          </div>
        );
      })}
    </div>
  );
}