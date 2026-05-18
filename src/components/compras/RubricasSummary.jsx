import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

export default function RubricasSummary() {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-summary'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Rubrica.list('rubrica', 100);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }
  });

  const summary = useMemo(() => {
    const totalOrcado = rubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0);
    const totalUtilizado = rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0);
    const totalSaldo = totalOrcado - totalUtilizado;
    const percentualExecucao = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;

    return {
      totalOrcado,
      totalUtilizado,
      totalSaldo,
      percentualExecucao,
      quantidadeRubricas: rubricas.length,
    };
  }, [rubricas]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Total Orçado</p>
              <p className="break-words text-xl font-bold leading-tight text-black tabular-nums">
                R$ {summary.totalOrcado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Total Utilizado</p>
              <p className="break-words text-xl font-bold leading-tight text-amber-700 tabular-nums">
                R$ {summary.totalUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-amber-600 mt-1">{summary.percentualExecucao.toFixed(1)}% execução</p>
            </div>
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Saldo Disponível</p>
              <p className="break-words text-xl font-bold leading-tight text-green-700 tabular-nums">
                R$ {summary.totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-green-600 mt-1">{(100 - summary.percentualExecucao).toFixed(1)}% livre</p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Comprometido</p>
              <p className="break-words text-xl font-bold leading-tight text-gray-800 tabular-nums">R$ 0,00</p>
              <p className="text-xs text-gray-500 mt-1">A confirmar</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-gray-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">Execução</p>
              <p className="text-2xl font-bold text-black">{summary.percentualExecucao.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-1">{summary.quantidadeRubricas} rubricas</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-lg font-bold text-gray-600">{summary.quantidadeRubricas}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabela de Rubricas */}
      <Card className="p-6 border border-gray-200 overflow-x-auto">
        <h3 className="text-sm font-semibold text-black mb-4">Rubricas Detalhadas</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-3 font-semibold text-gray-700">Rubrica</th>
              <th className="text-left py-3 px-3 font-semibold text-gray-700">Grupo</th>
              <th className="text-right py-3 px-3 font-semibold text-gray-700">Valor</th>
              <th className="text-right py-3 px-3 font-semibold text-gray-700">Utilizado</th>
              <th className="text-right py-3 px-3 font-semibold text-gray-700">Saldo</th>
              <th className="text-center py-3 px-3 font-semibold text-gray-700">%</th>
            </tr>
          </thead>
          <tbody>
            {rubricas.map((rubrica) => {
              const percentual = rubrica.valor_rubrica ? ((rubrica.valor_utilizado || 0) / rubrica.valor_rubrica) * 100 : 0;
              const statusColor = percentual < 30 ? 'text-green-700' : percentual < 60 ? 'text-amber-700' : 'text-red-700';
              return (
                <tr key={rubrica.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-3 text-gray-700 font-medium">{rubrica.rubrica}</td>
                  <td className="py-3 px-3 text-gray-600">{rubrica.grupo}</td>
                  <td className="text-right py-3 px-3 text-gray-700">
                    R$ {(rubrica.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-3 px-3 font-semibold text-gray-700">
                    R$ {(rubrica.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-700">
                    R$ {((rubrica.valor_rubrica || 0) - (rubrica.valor_utilizado || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`text-center py-3 px-3 font-semibold ${statusColor}`}>
                    {percentual.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
