import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, AlertCircle } from 'lucide-react';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export default function RubricasByMuseuDashboard({ rubricas = [], purchases = [], onRefresh }) {
  const [editingMuseu, setEditingMuseu] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingMuseu, setSavingMuseu] = useState(null);

  const museus = ['MHAB', 'MIS', 'MUMO'];

  // Calcular dados por museu
  const dadosPorMuseu = useMemo(() => {
    const map = {};

    museus.forEach((museu) => {
      map[museu] = {
        museu,
        rubricas: [],
        totalPrevisto: 0,
        totalUtilizado: 0,
        totalDisponivel: 0
      };
    });

    // Agrupar rubricas por museu
    (rubricas || []).forEach((r) => {
      const museuMatch = museus.find((m) => r?.rubrica?.includes(m) || r?.grupo?.includes(m) || r?.meta?.includes(m));
      if (museuMatch && map[museuMatch]) {
        const valor = toNumber(r?.valor_rubrica || r?.valor_total);
        const utilizado = toNumber(r?.valor_utilizado);
        const disponivel = valor - utilizado;

        map[museuMatch].rubricas.push({
          ...r,
          valor,
          utilizado,
          disponivel,
          percentual: valor > 0 ? (utilizado / valor) * 100 : 0
        });

        map[museuMatch].totalPrevisto += valor;
        map[museuMatch].totalUtilizado += utilizado;
        map[museuMatch].totalDisponivel += disponivel;
      }
    });

    return Object.values(map).sort((a, b) => a.museu.localeCompare(b.museu));
  }, [rubricas]);

  // Calcular status por museu
  const statusPorMuseu = useMemo(() => {
    const map = {};

    museus.forEach((museu) => {
      const purchasesMuseu = (purchases || []).filter((p) => {
        const centro = String(p?.centro_custo || '').trim().toUpperCase();
        return centro === museu || centro.includes(museu);
      });

      const aprovados = purchasesMuseu.filter((p) => {
        const status = String(p?.status || '').toUpperCase();
        return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(status);
      });

      const pagos = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'PAGO');

      map[museu] = {
        museu,
        totalCompras: purchasesMuseu.length,
        aprovadas: aprovados.length,
        pagas: pagos.length,
        percentualAprovacao: purchasesMuseu.length > 0 ? (aprovados.length / purchasesMuseu.length) * 100 : 0,
        percentualPagamento: aprovados.length > 0 ? (pagos.length / aprovados.length) * 100 : 0
      };
    });

    return map;
  }, [purchases]);

  async function handleEditOrcamento(museu, rubricaId, currentValue) {
    setEditingMuseu(`${museu}-${rubricaId}`);
    setEditValue(String(currentValue));
  }

  async function handleSaveOrcamento(museu, rubricaId) {
    setSavingMuseu(`${museu}-${rubricaId}`);

    try {
      const newValue = parseFloat(String(editValue).replace(/\./g, '').replace(',', '.'));

      if (!Number.isFinite(newValue) || newValue < 0) {
        toast.error('Informe um valor válido');
        return;
      }

      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica: newValue
      });

      toast.success('Valor atualizado');
      setEditingMuseu(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSavingMuseu(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {dadosPorMuseu.map((dados) => {
          const status = statusPorMuseu[dados.museu] || {};
          const percentualUso = dados.totalPrevisto > 0 ? (dados.totalUtilizado / dados.totalPrevisto) * 100 : 0;
          const statusColor =
            percentualUso > 90 ? 'text-red-600' : percentualUso > 70 ? 'text-amber-600' : 'text-green-700';

          return (
            <Card key={dados.museu} className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">{dados.museu}</h3>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Orçamento Previsto</p>
                  <p className="text-lg font-bold text-gray-900">{fmtBRL(dados.totalPrevisto)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Utilizado</p>
                  <p className="text-lg font-bold text-blue-700">{fmtBRL(dados.totalUtilizado)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Saldo Disponível</p>
                  <p className={`text-lg font-bold ${dados.totalDisponivel < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {fmtBRL(dados.totalDisponivel)}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600">Execução</p>
                    <p className={`text-xs font-bold ${statusColor}`}>{percentualUso.toFixed(1)}%</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        percentualUso > 90 ? 'bg-red-600' : percentualUso > 70 ? 'bg-amber-500' : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(percentualUso, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Solicitações</span>
                    <span className="font-semibold text-gray-900">{status.totalCompras}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Aprovadas</span>
                    <span className="font-semibold text-green-700">
                      {status.aprovadas} ({status.percentualAprovacao?.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pagas</span>
                    <span className="font-semibold text-blue-700">
                      {status.pagas} ({status.percentualPagamento?.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabela detalhada por museu */}
      <div className="space-y-6">
        {dadosPorMuseu.map((museuDados) => (
          <div key={museuDados.museu} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Rubricas — {museuDados.museu}
              </h4>
            </div>

            {museuDados.rubricas.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Nenhuma rubrica vinculada</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Rubrica</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Orçamento</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Utilizado</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Saldo</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {museuDados.rubricas.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.rubrica || r.nome}</td>
                        <td
                          className="px-3 py-2 text-right cursor-pointer hover:bg-yellow-100 font-medium text-gray-900"
                          onClick={() => handleEditOrcamento(museuDados.museu, r.id, r.valor)}
                        >
                          {editingMuseu === `${museuDados.museu}-${r.id}` ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSaveOrcamento(museuDados.museu, r.id)}
                              className="w-full border rounded px-1 text-right"
                              disabled={savingMuseu === `${museuDados.museu}-${r.id}`}
                            />
                          ) : (
                            fmtBRL(r.valor)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-blue-700">{fmtBRL(r.utilizado)}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            r.disponivel < 0 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {fmtBRL(r.disponivel)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{r.percentual.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold border-t border-gray-200">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right text-gray-900">{fmtBRL(museuDados.totalPrevisto)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmtBRL(museuDados.totalUtilizado)}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          museuDados.totalDisponivel < 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {fmtBRL(museuDados.totalDisponivel)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {museuDados.totalPrevisto > 0
                          ? ((museuDados.totalUtilizado / museuDados.totalPrevisto) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}