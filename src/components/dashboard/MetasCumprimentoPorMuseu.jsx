import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell, Legend
} from 'recharts';
import { Target, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { METAS_PROJETO_FALLBACK } from '@/lib/metasProjeto';

const MUSEUS = ['MUMO', 'MIS', 'MHAB'];
const MUSEU_COLORS = { MUMO: '#1e293b', MIS: '#475569', MHAB: '#94a3b8' };

// Metas com natureza quantificável — 3º Aditivo (plano de trabalho oficial)
// M5 e M6 não constam no plano; M20=30 ações; M10=18 mostras; M16=101 diárias
const METAS_QUANTITATIVAS = [
  { numero: '10', label: 'Meta 10', desc: '18 mostras', total: 18 },
  { numero: '20', label: 'Meta 20', desc: '30 ações educ./culturais', total: 30 },
  { numero: '16', label: 'Meta 16', desc: '101 diárias educador', total: 101 },
  { numero: '19', label: 'Meta 19', desc: 'Presente de Iemanjá', total: 1 },
];

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
}

function pct(used, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function getMuseuFromRubrica(r) {
  const cc = String(r?.centro_custo || r?.museu_codigo || '').toUpperCase();
  if (cc.includes('MUMO')) return 'MUMO';
  if (cc.includes('MIS')) return 'MIS';
  if (cc.includes('MHAB') || cc.includes('MAB')) return 'MHAB';
  return null;
}

function getMetaNumero(rubrica) {
  const meta = String(rubrica?.meta || rubrica?.grupo || '');
  const m = meta.match(/(\d+)/);
  return m ? m[1] : null;
}

function getMetaNumeroFromActivity(a) {
  const mc = String(a?.meta_codigo || a?.meta_id || '');
  const m = mc.match(/(\d+)/);
  return m ? m[1] : null;
}

function getMuseuFromActivity(a) {
  const list = Array.isArray(a?.museu_lista) ? a.museu_lista : [];
  const museu = String(a?.museu || list[0] || '').toUpperCase();
  if (museu.includes('MUMO')) return 'MUMO';
  if (museu.includes('MIS')) return 'MIS';
  if (museu.includes('MHAB') || museu.includes('MAB')) return 'MHAB';
  return null;
}

// Gauge circular simples usando SVG
function GaugeCircle({ value, max = 100, color = '#1e293b', size = 72, label }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pctVal = Math.min(100, (value / max) * 100);
  const offset = circ - (pctVal / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="text-xs font-bold text-slate-700" style={{ marginTop: -size / 2 - 10 }}>
        {Math.round(pctVal)}%
      </span>
      {label && <span className="text-[10px] text-slate-500 text-center leading-tight max-w-[70px]">{label}</span>}
    </div>
  );
}

const CUSTOM_TOOLTIP = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-lg text-xs space-y-1">
      <p className="font-bold text-slate-800">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}%
        </p>
      ))}
    </div>
  );
};

export default function MetasCumprimentoPorMuseu({ rubricas = [] }) {
  const [expanded, setExpanded] = useState(true);

  // Atividades de todos os relatórios
  const { data: allActivities = [] } = useQuery({
    queryKey: ['dashboard-metas-atividades'],
    queryFn: async () => {
      const reports = await base44.entities.Report.list('-created_date', 300);
      const all = [];
      for (const r of (Array.isArray(reports) ? reports : [])) {
        for (const a of (Array.isArray(r.atividades) ? r.atividades : [])) {
          all.push({ ...a, _museu: r.museu, _mes: r.mes_referencia, _ano: r.ano });
        }
      }
      return all;
    },
    staleTime: 1000 * 60 * 3,
  });

  // 1. Execução financeira por museu (rubricas)
  const financeiroPorMuseu = useMemo(() => {
    const map = { MUMO: { previsto: 0, utilizado: 0 }, MIS: { previsto: 0, utilizado: 0 }, MHAB: { previsto: 0, utilizado: 0 } };
    for (const r of rubricas) {
      const museu = getMuseuFromRubrica(r);
      if (!museu || !map[museu]) continue;
      map[museu].previsto += Number(r.valor_rubrica || r.valor_total || 0);
      map[museu].utilizado += Number(r.valor_utilizado || 0);
    }
    return MUSEUS.map(m => ({
      museu: m,
      previsto: map[m].previsto,
      utilizado: map[m].utilizado,
      pct: pct(map[m].utilizado, map[m].previsto),
    }));
  }, [rubricas]);

  // 2. Cumprimento de metas quantitativas por museu (atividades)
  const metasQuantPorMuseu = useMemo(() => {
    // conta atividades por meta_numero e museu
    const counts = {}; // { 'MUMO_5': 3 }
    for (const a of allActivities) {
      const museuA = getMuseuFromActivity(a) || String(a._museu || '').toUpperCase().substring(0, 4);
      const metaN = getMetaNumeroFromActivity(a);
      if (!museuA || !metaN) continue;
      const key = `${museuA}_${metaN}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    return METAS_QUANTITATIVAS.map(meta => {
      const row = { meta: `M${meta.numero}`, desc: meta.desc, total: meta.total };
      let totalGeral = 0;
      for (const m of MUSEUS) {
        const val = counts[`${m}_${meta.numero}`] || 0;
        // Percentual em relação ao total geral da meta (não dividido por museu)
        row[m] = pct(val, meta.total);
        row[`${m}_abs`] = val;
        totalGeral += val;
      }
      row.totalPct = pct(totalGeral, meta.total);
      row.totalAbs = totalGeral;
      return row;
    });
  }, [allActivities]);

  // 3. Totais consolidados por museu (gauge)
  const gaugesPorMuseu = useMemo(() => {
    return MUSEUS.map(m => {
      const fin = financeiroPorMuseu.find(x => x.museu === m) || {};
      // média ponderada: 60% financeiro + 40% atividades
      const atPcts = metasQuantPorMuseu.map(meta => Math.min(100, meta[m] || 0));
      const atMedia = atPcts.length > 0 ? atPcts.reduce((a, b) => a + b, 0) / atPcts.length : 0;
      const score = Math.round(0.6 * (fin.pct || 0) + 0.4 * atMedia);
      return { museu: m, score, financeiro: fin.pct || 0, atividades: Math.round(atMedia) };
    });
  }, [financeiroPorMuseu, metasQuantPorMuseu]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-slate-700" />
          <div className="text-left">
            <h2 className="text-base font-bold text-slate-900">Cumprimento de Metas por Museu</h2>
            <p className="text-xs text-slate-500">Execução financeira + atividades · 3º Aditivo</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-6 space-y-6 border-t border-slate-100">

          {/* Gauges por museu */}
          <div className="pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Score consolidado (financeiro + atividades)</p>
            <div className="grid grid-cols-3 gap-4">
              {gaugesPorMuseu.map(g => (
                <div key={g.museu} className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 bg-slate-50">
                  <span className="text-sm font-bold text-slate-800">{g.museu}</span>
                  <GaugeCircle value={g.score} max={100} color={MUSEU_COLORS[g.museu]} size={80} />
                  <div className="w-full space-y-1 mt-1">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Financeiro</span><span className="font-semibold text-slate-700">{g.financeiro}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-slate-700" style={{ width: `${g.financeiro}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Atividades</span><span className="font-semibold text-slate-700">{g.atividades}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${g.atividades}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Execução financeira por museu */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Execução financeira das rubricas por museu</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeiroPorMuseu} barCategoryGap="30%">
                  <XAxis dataKey="museu" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="pct" name="Execução" radius={[6, 6, 0, 0]}>
                    {financeiroPorMuseu.map(entry => (
                      <Cell key={entry.museu} fill={MUSEU_COLORS[entry.museu]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {financeiroPorMuseu.map(f => (
                <div key={f.museu} className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center">
                  <p className="text-[10px] text-slate-500">{f.museu}</p>
                  <p className="text-xs font-bold text-slate-800">{fmtBRL(f.utilizado)}</p>
                  <p className="text-[10px] text-slate-400">de {fmtBRL(f.previsto)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Metas quantitativas por museu */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Metas quantitativas — atividades por museu (%)</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metasQuantPorMuseu} barCategoryGap="20%" barGap={2}>
                  <XAxis dataKey="meta" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {MUSEUS.map(m => (
                    <Bar key={m} dataKey={m} name={m} fill={MUSEU_COLORS[m]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Tabela resumo */}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Meta</th>
                    <th className="text-center py-1.5 px-2 text-slate-500 font-medium">Total</th>
                    <th className="text-center py-1.5 px-2 text-slate-500 font-medium">Realizado</th>
                    <th className="text-center py-1.5 px-2 text-slate-500 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {metasQuantPorMuseu.map(m => (
                    <tr key={m.meta} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-medium text-slate-700">{m.meta} <span className="text-slate-400 font-normal">· {m.desc}</span></td>
                      <td className="py-1.5 px-2 text-center text-slate-500">{m.total}</td>
                      <td className="py-1.5 px-2 text-center font-semibold text-slate-800">{m.totalAbs}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${m.totalPct >= 80 ? 'bg-slate-900 text-white' : m.totalPct >= 50 ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500'}`}>
                          {m.totalPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}