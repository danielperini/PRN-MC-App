import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Valores contratuais oficiais — usados apenas como referência no banner
const CONTRATO_3_ADITIVO = 1320000;
const CONTRATO_4_ADITIVO = 81719.85;
const CONTRATO_TOTAL_OFICIAL = CONTRATO_3_ADITIVO + CONTRATO_4_ADITIVO;

function fmtBRL(v) {
  if (!v && v !== 0) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function toNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getCorBarra(pct) {
  if (pct >= 100) return '#ef4444';
  if (pct >= 80) return '#f97316';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 mb-1 max-w-[220px] break-words">{label}</p>
      <p className="text-gray-500">Total previsto: <span className="font-medium text-gray-800">{fmtBRL(d?.total)}</span></p>
      <p className="text-gray-500">Utilizado: <span className="font-medium text-gray-800">{fmtBRL(d?.utilizado)}</span></p>
      <p className="text-gray-500">Saldo: <span className="font-medium text-gray-800">{fmtBRL(d?.saldo)}</span></p>
      <p className="text-gray-500">Execução: <span className="font-semibold" style={{ color: getCorBarra(d?.pct) }}>{d?.pct?.toFixed(1)}%</span></p>
    </div>
  );
};

function fmtBRLSigned(v) {
  const abs = Math.abs(v);
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return v < 0 ? `-${formatted}` : `+${formatted}`;
}

const APRES_INFRA_PATTERNS = [
  { label: 'Apresentações culturais – 3 museus PBH', match: r => /apresenta/i.test(r.rubrica || r.nome || '') && /3 museus/i.test(r.rubrica || r.nome || '') },
  { label: 'Apresentações – MIS/MUMO/MHAB', match: r => /apresenta/i.test(r.rubrica || r.nome || '') && /mis.mumo.mhab/i.test(r.rubrica || r.nome || '') },
  { label: 'Infraestrutura 3 museus PBH', match: r => /infraestrutura/i.test(r.rubrica || r.nome || '') && /3 museus/i.test(r.rubrica || r.nome || '') },
  { label: 'Infraestrutura MIS/MUMO/MHAB', match: r => /infraestrutura/i.test(r.rubrica || r.nome || '') && /mis.mumo.mhab/i.test(r.rubrica || r.nome || '') },
];

function ApresentacaoInfraTable({ rubricas }) {
  const rows = APRES_INFRA_PATTERNS.map(({ label, match }) => {
    const r = (rubricas || []).find(match);
    if (!r) return { label, limite: 0, utilizado: 0, saldo: 0 };
    const limite = toNum(r.valor_rubrica || r.valor_total);
    const utilizado = toNum(r.valor_utilizado);
    const saldo = limite - utilizado;
    return { label, limite, utilizado, saldo };
  });

  const anyData = rows.some(r => r.limite > 0);
  if (!anyData) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">Apresentações e Infraestrutura — Noturno 2026</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Rubrica</th>
              <th className="px-4 py-2 text-right font-medium">Limite</th>
              <th className="px-4 py-2 text-right font-medium">Utilizado</th>
              <th className="px-4 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.label} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{row.label}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{fmtBRL(row.limite)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{fmtBRL(row.utilizado)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${row.saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmtBRLSigned(row.saldo)}
                  {row.saldo < 0 && <span className="ml-1 text-xs">⚠️</span>}
                  {row.saldo >= 0 && <span className="ml-1 text-xs">✅</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RubricasConsumoDashboard({ rubricas }) {
  const [grupoBusca, setGrupoBusca] = useState('');
  const [somenteAtivas, setSomenteAtivas] = useState(true);

  const dados = useMemo(() => {
    const vistos = new Set();
    return (rubricas || [])
      .filter(r => {
        if (!r?.id || vistos.has(r.id)) return false;
        vistos.add(r.id);
        if (somenteAtivas && r.ativo === false) return false;
        if (grupoBusca && !String(r.grupo || r.rubrica || '').toLowerCase().includes(grupoBusca.toLowerCase())) return false;
        return true;
      })
      .map(r => {
        const total = toNum(r.valor_rubrica || r.valor_total);
        const utilizado = toNum(r.valor_utilizado);
        const saldo = total - utilizado;
        const pct = total > 0 ? (utilizado / total) * 100 : 0;
        return {
          id: r.id,
          nome: r.rubrica || r.nome || 'Sem nome',
          grupo: r.grupo || '',
          total,
          utilizado,
          saldo,
          pct,
          cor: getCorBarra(pct),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [rubricas, grupoBusca, somenteAtivas]);

  const totais = useMemo(() => {
    const calculado = dados.reduce((acc, d) => ({ total: acc.total + d.total, utilizado: acc.utilizado + d.utilizado }), { total: 0, utilizado: 0 });
    // Usar sempre a soma real das rubricas como base do previsto
    const total = calculado.total;
    return {
      total,
      utilizado: calculado.utilizado,
      saldo: total - calculado.utilizado,
      pct: total > 0 ? (calculado.utilizado / total) * 100 : 0,
      total_calculado_rubricas: calculado.total,
      diferenca_rubricas: calculado.total - CONTRATO_TOTAL_OFICIAL,
    };
  }, [dados, grupoBusca, somenteAtivas]);

  const grupos = useMemo(() => {
    const s = new Set((rubricas || []).map(r => r.grupo).filter(Boolean));
    return Array.from(s).sort();
  }, [rubricas]);

  const chunks = useMemo(() => {
    const result = [];
    for (let i = 0; i < dados.length; i += 15) result.push(dados.slice(i, i + 15));
    return result;
  }, [dados]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <span className="font-semibold">Base contratual oficial:</span> {fmtBRL(CONTRATO_TOTAL_OFICIAL)}
        <span className="ml-2">(3º aditivo {fmtBRL(CONTRATO_3_ADITIVO)} + 4º aditivo {fmtBRL(CONTRATO_4_ADITIVO)})</span>
        {Math.abs(totais.diferenca_rubricas) > 0.01 && (
          <span className="ml-2 font-medium text-amber-700">
            {totais.diferenca_rubricas > 0
              ? `A soma das rubricas excede a base contratual em ${fmtBRL(totais.diferenca_rubricas)}.`
              : `A soma das rubricas está abaixo da base contratual em ${fmtBRL(Math.abs(totais.diferenca_rubricas))}.`}
          </span>
        )}
        <span className="ml-2 text-blue-700 font-semibold">· Previsto real: {fmtBRL(totais.total)}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Previsto', value: fmtBRL(totais.total), color: 'text-gray-900' },
          { label: 'Total Utilizado', value: fmtBRL(totais.utilizado), color: 'text-orange-600' },
          { label: 'Saldo Disponível', value: (totais.saldo < 0 ? '-' : '') + fmtBRL(Math.abs(totais.saldo)), color: totais.saldo < 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Execução Geral', value: `${totais.pct.toFixed(1)}%`, color: totais.pct >= 80 ? 'text-red-600' : 'text-blue-700' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Nível de execução:</span>
        {[
          { cor: '#22c55e', label: '< 50%' },
          { cor: '#eab308', label: '50–79%' },
          { cor: '#f97316', label: '80–99%' },
          { cor: '#ef4444', label: '≥ 100%' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: l.cor }} />
            {l.label}
          </span>
        ))}
      </div>

      <ApresentacaoInfraTable rubricas={rubricas} />

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar rubrica ou grupo..."
          value={grupoBusca}
          onChange={e => setGrupoBusca(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 w-64"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={somenteAtivas} onChange={e => setSomenteAtivas(e.target.checked)} className="rounded" />
          Somente rubricas ativas
        </label>
        <span className="text-xs text-gray-400">{dados.length} rubricas</span>
      </div>

      {dados.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400 text-sm">
          Nenhuma rubrica encontrada.
        </div>
      )}

      {chunks.map((chunk, ci) => (
        <div key={ci} className="rounded-xl border border-gray-200 bg-white p-4">
          {chunks.length > 1 && (
            <p className="text-xs text-gray-400 mb-3">Grupo {ci + 1} de {chunks.length}</p>
          )}
          <ResponsiveContainer width="100%" height={chunk.length * 36 + 40}>
            <BarChart
              data={chunk}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              barCategoryGap="25%"
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis
                type="number"
                tickFormatter={v => fmtBRL(v)}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nome"
                width={180}
                tick={{ fontSize: 11, fill: '#374151' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Total Previsto" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
              <Bar dataKey="utilizado" name="Utilizado" radius={[0, 4, 4, 0]}>
                {chunk.map((entry) => (
                  <Cell key={entry.id} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}