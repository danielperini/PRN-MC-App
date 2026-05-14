import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function MuseuPerformanceDashboard({ purchases = [], rubricas = [] }) {
  const museus = ['MHAB', 'MIS', 'MUMO'];

  const performanceData = useMemo(() => {
    return museus.map((museu) => {
      const purchasesMuseu = (purchases || []).filter((p) => {
        const centro = String(p?.centro_custo || '').trim().toUpperCase();
        return centro === museu || centro.includes(museu);
      });

      const rubricasMuseu = (rubricas || []).filter((r) => {
        return r?.rubrica?.includes(museu) || r?.grupo?.includes(museu) || r?.meta?.includes(museu);
      });

      const rascunho = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'RASCUNHO');
      const solicitado = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'SOLICITADO');
      const aprovados = purchasesMuseu.filter((p) => {
        const status = String(p?.status || '').toUpperCase();
        return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(status);
      });
      const pagas = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'PAGO');
      const reprovados = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'RECUSADO');

      const totalOrcado = rubricasMuseu.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
      const totalUtilizado = rubricasMuseu.reduce((acc, r) => acc + toNumber(r.valor_utilizado), 0);
      const totalDisponivel = totalOrcado - totalUtilizado;

      const percentualExecutado = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;

      return {
        museu,
        compras: {
          rascunho: rascunho.length,
          solicitado: solicitado.length,
          aprovados: aprovados.length,
          pagas: pagas.length,
          reprovados: reprovados.length,
          total: purchasesMuseu.length
        },
        orcamento: {
          total: totalOrcado,
          utilizado: totalUtilizado,
          disponivel: totalDisponivel,
          percentual: percentualExecutado
        }
      };
    });
  }, [purchases, rubricas]);

  const totaisGlobais = useMemo(() => {
    return {
      comprasTotal: performanceData.reduce((acc, m) => acc + m.compras.total, 0),
      orcadoTotal: performanceData.reduce((acc, m) => acc + m.orcamento.total, 0),
      utilizadoTotal: performanceData.reduce((acc, m) => acc + m.orcamento.utilizado, 0),
      aproveitos: performanceData.reduce((acc, m) => acc + m.compras.aprovados, 0)
    };
  }, [performanceData]);

  return (
    <div className="space-y-6">
      {/* Resumo consolidado */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-700">Total de Solicitações</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{totaisGlobais.comprasTotal}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <p className="text-xs font-medium text-green-700">Aprovadas</p>
          <p className="text-2xl font-bold text-green-900 mt-1">{totaisGlobais.aproveitos}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <p className="text-xs font-medium text-purple-700">Orçamento Total</p>
          <p className="text-lg font-bold text-purple-900 mt-1">{fmtBRL(totaisGlobais.orcadoTotal)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <p className="text-xs font-medium text-amber-700">Execução Média</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">
            {totaisGlobais.orcadoTotal > 0
              ? ((totaisGlobais.utilizadoTotal / totaisGlobais.orcadoTotal) * 100).toFixed(1)
              : 0}
            %
          </p>
        </Card>
      </div>

      {/* Performance por museu */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {performanceData.map((data) => {
          const executionColor =
            data.orcamento.percentual > 90
              ? 'bg-red-50 border-red-200'
              : data.orcamento.percentual > 70
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200';

          const executionBadgeColor =
            data.orcamento.percentual > 90
              ? 'text-red-700'
              : data.orcamento.percentual > 70
                ? 'text-amber-700'
                : 'text-green-700';

          return (
            <Card key={data.museu} className={`p-4 border ${executionColor}`}>
              <div className="mb-4">
                <h3 className="font-bold text-gray-900 text-lg">{data.museu}</h3>
              </div>

              {/* Orçamento */}
              <div className="space-y-3 mb-4 pb-4 border-b border-gray-200">
                <div>
                  <p className="text-xs text-gray-600">Orçamento</p>
                  <p className="font-bold text-gray-900">{fmtBRL(data.orcamento.total)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600">Utilizado</p>
                  <p className="font-bold text-blue-700">{fmtBRL(data.orcamento.utilizado)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-600">Disponível</p>
                  <p
                    className={`font-bold ${
                      data.orcamento.disponivel < 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    {fmtBRL(data.orcamento.disponivel)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-600">Execução</p>
                    <p className={`text-xs font-bold ${executionBadgeColor}`}>
                      {data.orcamento.percentual.toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        data.orcamento.percentual > 90
                          ? 'bg-red-600'
                          : data.orcamento.percentual > 70
                            ? 'bg-amber-500'
                            : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(data.orcamento.percentual, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Solicitações */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase">Solicitações</p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white rounded p-2 border border-gray-200">
                    <p className="text-gray-600">Rascunho</p>
                    <p className="font-bold text-gray-900">{data.compras.rascunho}</p>
                  </div>

                  <div className="bg-white rounded p-2 border border-gray-200">
                    <p className="text-gray-600">Pendente</p>
                    <p className="font-bold text-blue-700">{data.compras.solicitado}</p>
                  </div>

                  <div className="bg-white rounded p-2 border border-gray-200 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <div>
                      <p className="text-gray-600">Aprovadas</p>
                      <p className="font-bold text-green-700">{data.compras.aprovados}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded p-2 border border-gray-200">
                    <p className="text-gray-600">Pagas</p>
                    <p className="font-bold text-blue-700">{data.compras.pagas}</p>
                  </div>
                </div>

                {data.compras.reprovados > 0 && (
                  <div className="bg-red-100 border border-red-300 rounded p-2 flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-red-600" />
                    <div className="text-xs">
                      <p className="text-red-700 font-semibold">{data.compras.reprovados} reprovada(s)</p>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-600 pt-2 border-t border-gray-200">
                  <p>
                    <span className="font-semibold text-gray-900">{data.compras.total}</span> solicitações no total
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Indicadores de saúde */}
      <Card className="p-4">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          Indicadores de Desempenho
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Museu</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">% Aprovação</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">% Pagamento</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Saúde Financeira</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {performanceData.map((data) => {
                const percentAprovacao = data.compras.total > 0 ? (data.compras.aprovados / data.compras.total) * 100 : 0;
                const percentPagamento =
                  data.compras.aprovados > 0 ? (data.compras.pagas / data.compras.aprovados) * 100 : 0;

                const saudeStatus =
                  data.orcamento.percentual > 90
                    ? { label: 'Crítica', color: 'text-red-700 bg-red-50' }
                    : data.orcamento.percentual > 70
                      ? { label: 'Atenção', color: 'text-amber-700 bg-amber-50' }
                      : { label: 'Saudável', color: 'text-green-700 bg-green-50' };

                return (
                  <tr key={data.museu} className="border-t border-gray-100">
                    <td className="px-3 py-3 font-semibold text-gray-900">{data.museu}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                        {percentAprovacao.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">
                        {percentPagamento.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${saudeStatus.color}`}>
                        {data.orcamento.percentual.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {saudeStatus.label === 'Saudável' && <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />}
                      {saudeStatus.label === 'Atenção' && (
                        <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />
                      )}
                      {saudeStatus.label === 'Crítica' && (
                        <AlertTriangle className="h-4 w-4 text-red-600 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}