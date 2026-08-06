import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  ArrowUpRight, ArrowDownLeft, TrendingUp, Wallet,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { agruparMovimentacoesPorMes, resumirRegistrosMensais } from '@/utils/movimentacoesMensais';
import ExtratosDrivePorMes from '@/components/movimentacoes/ExtratosDrivePorMes';
import ImportarAuditarTodosMeses from '@/components/movimentacoes/ImportarAuditarTodosMeses';
import ResumoRubricasExtratos from '@/components/movimentacoes/ResumoRubricasExtratos';
import NotasDriveForaPrestacao from '@/components/movimentacoes/NotasDriveForaPrestacao';
import useThemeChartColors from '@/hooks/useThemeChartColors';

const MESES_CURTO = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0));
}

function fmtK(valor) {
  const n = Number(valor || 0);
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toFixed(1)} mi`;
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(0)} mil`;
  return `R$ ${n.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 border-b border-slate-100 pb-2 font-bold text-slate-800">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5">
            <span style={{ color: item.color }} className="font-medium">{item.name}</span>
            <span className="font-bold text-slate-700">{fmtBRL(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FluxoCaixaMensal() {
  const [expanded, setExpanded] = useState(true);
  const { series, isArtistic } = useThemeChartColors();

  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias-dashboard'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 2000),
    staleTime: 1000 * 60 * 2,
  });

  const dadosMensais = useMemo(() => {
    return agruparMovimentacoesPorMes(movimentacoes)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12)
      .map((grupo) => {
        const resumo = resumirRegistrosMensais(grupo.registros);
        return {
          key: grupo.key,
          ano: grupo.ano,
          mes_num: grupo.mes_num,
          label: `${MESES_CURTO[grupo.mes_num]}/${String(grupo.ano).slice(-2)}`,
          creditos: resumo.creditos,
          debitos: resumo.debitos,
          rendimento: resumo.rendimento,
          saldo: resumo.saldo,
          saldoConta: resumo.saldo_conta,
          saldoInvestimento: resumo.saldo_investimento,
          transferenciasInternas: resumo.transferencias_internas_valor,
        };
      });
  }, [movimentacoes]);

  const totais = useMemo(() => dadosMensais.reduce((acumulado, periodo) => ({
    creditos: acumulado.creditos + periodo.creditos,
    debitos: acumulado.debitos + periodo.debitos,
    rendimento: acumulado.rendimento + periodo.rendimento,
    transferenciasInternas: acumulado.transferenciasInternas + periodo.transferenciasInternas,
  }), {
    creditos: 0,
    debitos: 0,
    rendimento: 0,
    transferenciasInternas: 0,
  }), [dadosMensais]);

  const ultimoPeriodo = dadosMensais[dadosMensais.length - 1];
  const saldoAtual = ultimoPeriodo?.saldo || 0;

  if (isLoading) return null;

  return (
    <div className="space-y-5">
      <ImportarAuditarTodosMeses onConcluido={refetch} />
      <ExtratosDrivePorMes movimentacoes={movimentacoes} onSincronizado={refetch} />

      {movimentacoes.length > 0 && (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setExpanded((valor) => !valor)}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Resumo das Movimentações</h2>
                  <p className="text-xs text-slate-500">
                    Créditos, débitos operacionais, rendimentos e saldo por período · {dadosMensais.length} meses
                  </p>
                </div>
              </div>
              {expanded
                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {expanded && (
              <div className="space-y-6 border-t border-slate-100 px-5 pb-6 pt-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    {
                      label: 'Total de créditos', value: totais.creditos, detail: `${dadosMensais.length} período(s)`,
                      color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <ArrowUpRight className="h-4 w-4 text-green-600" />,
                    },
                    {
                      label: 'Débitos operacionais', value: totais.debitos, detail: 'Sem resgates e aplicações',
                      color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <ArrowDownLeft className="h-4 w-4 text-red-500" />,
                    },
                    {
                      label: 'Rendimentos', value: totais.rendimento, detail: 'Extratos de investimento',
                      color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: <TrendingUp className="h-4 w-4 text-blue-600" />,
                    },
                    {
                      label: 'Saldo atual consolidado', value: saldoAtual,
                      detail: ultimoPeriodo ? `Conta + investimento · ${ultimoPeriodo.label}` : 'Sem período',
                      color: saldoAtual >= 0 ? 'text-slate-800' : 'text-orange-700',
                      bg: saldoAtual >= 0 ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-200',
                      icon: <Wallet className="h-4 w-4 text-slate-500" />,
                    },
                  ].map((card) => (
                    <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                      <div className="mb-2 flex items-center justify-between">{card.icon}<span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</span></div>
                      <p className={`text-base font-bold ${card.color}`}>{fmtBRL(card.value)}</p>
                      <p className="mt-1 text-[10px] text-gray-500">{card.detail}</p>
                    </div>
                  ))}
                </div>

                {totais.transferenciasInternas > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <strong>{fmtBRL(totais.transferenciasInternas)}</strong> em resgates, aplicações e transferências internas foram preservados para auditoria, mas não foram contabilizados como despesa.
                  </div>
                )}

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comparação por período</p><p className="text-[11px] text-slate-400">As barras mostram entradas e saídas; as linhas mostram rendimento e saldo consolidado.</p></div></div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dadosMensais} barCategoryGap="25%" barGap={3}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={68} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                        <Bar dataKey="creditos" name="Créditos" fill={isArtistic ? series[0] : '#4ade80'} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="debitos" name="Débitos operacionais" fill={isArtistic ? series[1] : '#f87171'} radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="rendimento" name="Rendimentos" stroke={isArtistic ? series[2] : '#3b82f6'} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="saldo" name="Saldo consolidado" stroke={isArtistic ? series[3] : '#334155'} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-50"><tr className="border-b border-slate-200"><th className="px-3 py-3 text-left font-semibold text-slate-600">Período</th><th className="px-3 py-3 text-right font-semibold text-green-700">Créditos</th><th className="px-3 py-3 text-right font-semibold text-red-600">Débitos</th><th className="px-3 py-3 text-right font-semibold text-blue-600">Rendimentos</th><th className="px-3 py-3 text-right font-semibold text-slate-700">Saldo final</th></tr></thead>
                    <tbody>
                      {dadosMensais.map((periodo) => (
                        <tr key={periodo.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-3 font-semibold text-slate-700">{periodo.label}</td>
                          <td className="px-3 py-3 text-right font-medium text-green-700">{periodo.creditos ? fmtBRL(periodo.creditos) : '—'}</td>
                          <td className="px-3 py-3 text-right font-medium text-red-600">{periodo.debitos ? fmtBRL(periodo.debitos) : '—'}</td>
                          <td className="px-3 py-3 text-right font-medium text-blue-600">{periodo.rendimento ? fmtBRL(periodo.rendimento) : '—'}</td>
                          <td className={`px-3 py-3 text-right font-bold ${periodo.saldo >= 0 ? 'text-slate-800' : 'text-orange-700'}`}>{fmtBRL(periodo.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <ResumoRubricasExtratos movimentacoes={movimentacoes} />
          <NotasDriveForaPrestacao />
        </>
      )}
    </div>
  );
}