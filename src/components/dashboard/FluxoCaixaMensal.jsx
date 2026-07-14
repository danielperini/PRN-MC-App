import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { ArrowUpRight, ArrowDownLeft, TrendingUp, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { agruparMovimentacoesPorMes, resumirRegistrosMensais } from '@/utils/movimentacoesMensais';
import ExtratosDrivePorMes from '@/components/movimentacoes/ExtratosDrivePorMes';

const MESES_CURTO = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
}

function fmtK(v) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1000) return `R$${(n / 1000).toFixed(0)}k`;
  return `R$${n.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-xl text-xs space-y-1.5 min-w-[170px]">
      <p className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between items-center gap-4">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-bold text-slate-700">{fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function FluxoCaixaMensal() {
  const [expanded, setExpanded] = useState(true);

  const { data: movimentacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['movimentacoes-bancarias-dashboard'],
    queryFn: () => base44.entities.MovimentacaoBancaria.list('-ano', 200),
    staleTime: 1000 * 60 * 10,
  });

  const dadosMensais = useMemo(() => {
    return agruparMovimentacoesPorMes(movimentacoes)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-12)
      .map(grupo => {
        const resumo = resumirRegistrosMensais(grupo.registros);
        return {
          key: grupo.key,
          ano: grupo.ano,
          mes_num: grupo.mes_num,
          label: `${MESES_CURTO[grupo.mes_num]}/${String(grupo.ano).slice(-2)}`,
          creditos: resumo.creditos,
          debitos: resumo.debitos,
          rendimento: resumo.rendimento,
          saldo: resumo.creditos - resumo.debitos,
        };
      });
  }, [movimentacoes]);

  const totais = useMemo(() => ({
    creditos: dadosMensais.reduce((s, d) => s + d.creditos, 0),
    debitos: dadosMensais.reduce((s, d) => s + d.debitos, 0),
    rendimento: dadosMensais.reduce((s, d) => s + d.rendimento, 0),
  }), [dadosMensais]);

  const saldoGeral = totais.creditos - totais.debitos;

  if (isLoading) return null;

  return (
    <div className="space-y-5">
      <ExtratosDrivePorMes movimentacoes={movimentacoes} onSincronizado={refetch} />

      {movimentacoes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-slate-700" />
              <div className="text-left">
                <h2 className="text-base font-bold text-slate-900">Fluxo de Caixa Mensal</h2>
                <p className="text-xs text-slate-500">Créditos, débitos e rendimentos bancários · {dadosMensais.length} meses</p>
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {expanded && (
            <div className="px-5 pb-6 border-t border-slate-100 space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                {[
                  { label: 'Total créditos', value: totais.creditos, color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <ArrowUpRight className="w-4 h-4 text-green-600" /> },
                  { label: 'Total débitos', value: totais.debitos, color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <ArrowDownLeft className="w-4 h-4 text-red-500" /> },
                  { label: 'Rendimentos', value: totais.rendimento, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: <TrendingUp className="w-4 h-4 text-blue-600" /> },
                  { label: 'Saldo líquido', value: saldoGeral, color: saldoGeral >= 0 ? 'text-slate-800' : 'text-orange-600', bg: saldoGeral >= 0 ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-200', icon: <Wallet className="w-4 h-4 text-slate-500" /> },
                ].map((c, i) => (
                  <div key={i} className={`rounded-xl border ${c.bg} p-3.5`}>
                    <div className="flex items-center justify-between mb-1.5">{c.icon}<span className="text-[10px] text-gray-400 font-medium">{c.label}</span></div>
                    <p className={`text-base font-bold ${c.color}`}>{fmtBRL(c.value)}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Evolução mensal</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dadosMensais} barCategoryGap="25%" barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
                      <Bar dataKey="creditos" name="Créditos" fill="#4ade80" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="debitos" name="Débitos" fill="#f87171" radius={[4, 4, 0, 0]} />
                      {totais.rendimento > 0 && (
                        <Line type="monotone" dataKey="rendimento" name="Rendimentos" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-2 text-slate-500 font-semibold">Mês</th>
                      <th className="text-right py-2 px-2 text-green-600 font-semibold">Créditos</th>
                      <th className="text-right py-2 px-2 text-red-500 font-semibold">Débitos</th>
                      {totais.rendimento > 0 && <th className="text-right py-2 px-2 text-blue-500 font-semibold">Rendimento</th>}
                      <th className="text-right py-2 px-2 text-slate-600 font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMensais.map(d => (
                      <tr key={d.key} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-2 font-semibold text-slate-700">{d.label}</td>
                        <td className="py-2 px-2 text-right text-green-700 font-medium">{d.creditos > 0 ? fmtBRL(d.creditos) : '—'}</td>
                        <td className="py-2 px-2 text-right text-red-600 font-medium">{d.debitos > 0 ? fmtBRL(d.debitos) : '—'}</td>
                        {totais.rendimento > 0 && <td className="py-2 px-2 text-right text-blue-600 font-medium">{d.rendimento > 0 ? fmtBRL(d.rendimento) : '—'}</td>}
                        <td className={`py-2 px-2 text-right font-bold ${d.saldo >= 0 ? 'text-slate-800' : 'text-orange-600'}`}>{fmtBRL(d.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <Link to="/Movimentacoes" className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors">Ver detalhes completos →</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
