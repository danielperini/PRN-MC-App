import React from 'react';
import { Check, Clock, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_CONFIG = {
  pendente: { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Pendente' },
  pago: { icon: Check, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Pago' },
  comprovado: { icon: Check, color: 'text-green-600', bg: 'bg-green-50', label: 'Comprovado' },
};

export default function HistoricoPagamentos({ pagamentos = [], isLoading = false }) {
  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Carregando histórico...</div>;
  }

  if (pagamentos.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Nenhum pagamento registrado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Data</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Valor</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Confirmado por</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700">Comprovante</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pagamentos.map(pag => {
              const statusConfig = STATUS_CONFIG[pag.status] || STATUS_CONFIG.pendente;
              const StatusIcon = statusConfig.icon;

              return (
                <tr key={pag.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(pag.data_pagamento).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {pag.tipo_pagamento === 'transferencia_bancaria' ? 'Transferência' :
                     pag.tipo_pagamento === 'pix' ? 'PIX' : 'Depósito'}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    R$ {pag.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg}`}>
                      <StatusIcon className={`w-3.5 h-3.5 ${statusConfig.color}`} />
                      <span className={statusConfig.color}>{statusConfig.label}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {pag.confirmado_por_nome || '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {pag.comprovante_url ? (
                      <a
                        href={pag.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="text-xs">Ver</span>
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}