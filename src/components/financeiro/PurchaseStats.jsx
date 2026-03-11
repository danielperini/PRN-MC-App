import React from 'react';
import { Card } from '@/components/ui/card';
import { FileText, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export default function PurchaseStats({ purchases = [] }) {
  const stats = [
    {
      label: 'Total de Solicitações',
      value: purchases.length,
      icon: FileText,
      color: 'blue',
    },
    {
      label: 'Rascunho',
      value: purchases.filter(p => p.status === 'RASCUNHO').length,
      icon: Clock,
      color: 'gray',
    },
    {
      label: 'Pendente',
      value: purchases.filter(p => p.status === 'PENDENTE').length,
      icon: AlertCircle,
      color: 'amber',
    },
    {
      label: 'Aprovado',
      value: purchases.filter(p => p.status === 'APROVADO').length,
      icon: CheckCircle,
      color: 'green',
    },
    {
      label: 'Rejeitado',
      value: purchases.filter(p => p.status === 'REJEITADO').length,
      icon: XCircle,
      color: 'red',
    },
  ];

  const colorMap = {
    blue: 'bg-blue-50 border-blue-200',
    gray: 'bg-gray-50 border-gray-200',
    amber: 'bg-amber-50 border-amber-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
  };

  const textColorMap = {
    blue: 'text-blue-700',
    gray: 'text-gray-700',
    amber: 'text-amber-700',
    green: 'text-green-700',
    red: 'text-red-700',
  };

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Estatísticas de Compras</h3>
      <div className="space-y-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className={`p-3 rounded-lg border ${colorMap[stat.color]}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-xs font-medium ${textColorMap[stat.color]}`}>{stat.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${textColorMap[stat.color]}`}>{stat.value}</span>
                  <Icon className={`w-4 h-4 ${textColorMap[stat.color]}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicador de Performance */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-3">Taxa de Aprovação</p>
        <div className="space-y-2">
          {(() => {
            const total = purchases.length || 1;
            const approved = purchases.filter(p => p.status === 'APROVADO').length;
            const pending = purchases.filter(p => p.status === 'PENDENTE').length;
            const draft = purchases.filter(p => p.status === 'RASCUNHO').length;

            const approvedPercent = ((approved / total) * 100).toFixed(0);
            const pendingPercent = ((pending / total) * 100).toFixed(0);
            const draftPercent = ((draft / total) * 100).toFixed(0);

            return (
              <>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-green-700 font-medium">Aprovado</span>
                    <span className="text-xs text-green-700 font-bold">{approvedPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${approvedPercent}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-amber-700 font-medium">Pendente</span>
                    <span className="text-xs text-amber-700 font-bold">{pendingPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${pendingPercent}%` }} />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}