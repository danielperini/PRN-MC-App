import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from
'recharts';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import DrillDownSheet from '@/components/dashboard/DrillDownSheet';

const MUSEUS = ['MUMO', 'MIS', 'MHAB'];
const MUSEU_COLORS = { MUMO: '#1e293b', MIS: '#475569', MHAB: '#94a3b8' };

// Metas quantitativas do 3º Aditivo
const METAS_QUANTITATIVAS = [
{ numero: '10', label: 'M10', desc: '18 mostras', total: 18 },
{ numero: '20', label: 'M20', desc: '30 ações educ./culturais', total: 30 },
{ numero: '16', label: 'M16', desc: '101 diárias educador', total: 101 },
{ numero: '19', label: 'M19', desc: 'Presente de Iemanjá', total: 1 }];


// Orçamento previsto por museu (rubricas do 3º Aditivo — referência fixa do plano de trabalho)
const ORCAMENTO_PREVISTO = { MUMO: 228500, MIS: 22500, MHAB: 76250 };

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
}

function pct(used, total) {
  if (!total) return 0;
  return Math.min(100, Math.round(used / total * 100));
}

function museuFromString(s) {
  const u = String(s || '').toUpperCase();
  if (u.includes('MUMO')) return 'MUMO';
  if (u.includes('MIS')) return 'MIS';
  if (u.includes('MHAB') || u.includes('MAB')) return 'MHAB';
  return null;
}

function museuFromRubrica(r) {
  return museuFromString(r?.centro_custo) || museuFromString(r?.museu_codigo) || museuFromString(r?.grupo);
}

function museuFromPurchase(p) {
  return museuFromString(p?.centro_custo) || museuFromString(p?.rubrica_nome) || museuFromString(p?.descricao_item);
}

function museuFromActivity(a) {
  return museuFromString(a?.museu) || museuFromString(a?._museu);
}

function metaNumeroFromActivity(a) {
  const mc = String(a?.meta_codigo || a?.meta_id || '');
  // Aceita MC3A-10, M10, 10, etc.
  const m = mc.match(/(\d+)$/);
  return m ? m[1] : null;
}

// Gauge SVG circular
function GaugeCircle({ value, color = '#1e293b', size = 80 }) {
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const offset = circ - Math.min(100, value) / 100 * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        
      </svg>
      <span className="absolute text-sm font-black text-slate-800">{Math.round(value)}%</span>
    </div>);

}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-lg text-xs space-y-1">
      <p className="font-bold text-slate-800">{label}</p>
      {payload.map((p) =>
      <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}%</p>
      )}
    </div>);

};

export default function MetasCumprimentoPorMuseu({ rubricas = [] }) {
  const [expanded, setExpanded] = useState(true);
  const [drillDown, setDrillDown] = useState(null);

  // --- Solicitações de compra aprovadas/pagas (execução financeira real) ---
  const { data: purchases = [] } = useQuery({
    queryKey: ['dashboard-metas-purchases'],
    queryFn: () => base44.entities.PurchaseRequest.filter(
      { status: { $in: ['APROVADO_ADMIN', 'PAGO'] } },
      '-created_date', 500
    ),
    staleTime: 1000 * 60 * 5
  });

  // --- Atividades (entidade Activity) ---
  const { data: activities = [] } = useQuery({
    queryKey: ['dashboard-metas-activities'],
    queryFn: () => base44.entities.Activity.list('-created_date', 500),
    staleTime: 1000 * 60 * 3
  });

  // --- Relatórios (para drill-down por museu) ---
  const { data: allReports = [] } = useQuery({
    queryKey: ['dashboard-metas-all-reports'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-created_date', 300
    ),
    staleTime: 1000 * 60 * 5
  });

  // --- Atividades dentro dos relatórios (fallback / complemento) ---
  const reportActivities = useMemo(() => {
    const all = [];
    for (const r of allReports) {
      for (const a of Array.isArray(r.atividades) ? r.atividades : []) {
        all.push({ ...a, _museu: r.museu });
      }
    }
    return all;
  }, [allReports]);

  // ── Execução financeira por museu ──────────────────────────────────────────
  // Usa: 1) rubricas (valor_utilizado) 2) purchases (valor_pago / valor_aprovado_admin)
  const financeiroPorMuseu = useMemo(() => {
    const map = { MUMO: 0, MIS: 0, MHAB: 0 };

    // Fonte primária: rubricas com valor_utilizado
    for (const r of rubricas) {
      const museu = museuFromRubrica(r);
      if (museu && map[museu] !== undefined) {
        map[museu] += Number(r.valor_utilizado || 0);
      }
    }

    // Se nenhuma rubrica tiver valor_utilizado, usar purchases aprovadas
    const totalRubricas = Object.values(map).reduce((a, b) => a + b, 0);
    if (totalRubricas === 0) {
      for (const p of purchases) {
        const museu = museuFromPurchase(p);
        if (!museu || map[museu] === undefined) continue;
        const val = Number(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado || 0);
        map[museu] += val;
      }
    }

    return MUSEUS.map((m) => ({
      museu: m,
      previsto: ORCAMENTO_PREVISTO[m] || 0,
      utilizado: map[m],
      pct: pct(map[m], ORCAMENTO_PREVISTO[m])
    }));
  }, [rubricas, purchases]);

  // ── Metas quantitativas por museu (atividades) ────────────────────────────
  const metasQuantPorMuseu = useMemo(() => {
    // Merge: Activity entity + atividades dentro de relatórios
    const allActs = [
    ...activities,
    ...reportActivities];


    const counts = {}; // { 'MUMO_10': 2 }
    for (const a of allActs) {
      const museu = museuFromActivity(a);
      const metaN = metaNumeroFromActivity(a);
      if (!museu || !metaN) continue;
      const key = `${museu}_${metaN}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    return METAS_QUANTITATIVAS.map((meta) => {
      const row = { meta: meta.label, desc: meta.desc, total: meta.total };
      let totalAbs = 0;
      for (const m of MUSEUS) {
        const val = counts[`${m}_${meta.numero}`] || 0;
        row[m] = pct(val, meta.total);
        row[`${m}_abs`] = val;
        totalAbs += val;
      }
      row.totalAbs = totalAbs;
      row.totalPct = pct(totalAbs, meta.total);
      return row;
    });
  }, [activities, reportActivities]);

  // ── Score consolidado por museu ───────────────────────────────────────────
  const gaugesPorMuseu = useMemo(() => {
    return MUSEUS.map((m) => {
      const fin = financeiroPorMuseu.find((x) => x.museu === m) || {};
      const atPcts = metasQuantPorMuseu.map((meta) => meta[m] || 0);
      const atMedia = atPcts.length > 0 ? atPcts.reduce((a, b) => a + b, 0) / atPcts.length : 0;
      const score = Math.round(0.6 * (fin.pct || 0) + 0.4 * atMedia);
      return { museu: m, score, financeiro: fin.pct || 0, atividades: Math.round(atMedia) };
    });
  }, [financeiroPorMuseu, metasQuantPorMuseu]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      












      

      {expanded &&
      <div className="px-5 pb-6 space-y-6 border-t border-slate-100 hidden">

          {/* ── Gauges por museu ── */}
          <div className="pt-4">
            

          
            <div className="grid grid-cols-3 gap-4">
              {gaugesPorMuseu.map((g) =>
            <button
              key={g.museu}
              type="button"
              onClick={() => setDrillDown({
                title: `Museu ${g.museu}`,
                value: `Score: ${g.score}%`,
                sourceBadges: ['Relatórios', 'Público', 'Atividades'],
                type: 'museu',
                museu: g.museu,
                reports: allReports
              })}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-4 bg-slate-50 cursor-pointer hover:ring-2 hover:ring-slate-300 hover:bg-white transition-all text-left w-full hidden">
              
                  <span className="text-sm font-bold text-slate-800">{g.museu}</span>
                  <GaugeCircle value={g.score} color={MUSEU_COLORS[g.museu]} size={80} />
                  <div className="w-full space-y-1.5 mt-1">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>Financeiro</span><span className="font-semibold text-slate-700">{g.financeiro}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full bg-slate-700 transition-all" style={{ width: `${g.financeiro}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>Atividades</span><span className="font-semibold text-slate-700">{g.atividades}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200">
                        <div className="h-1.5 rounded-full bg-slate-400 transition-all" style={{ width: `${g.atividades}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
            )}
            </div>
          </div>

          {/* ── Execução financeira por museu ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Execução financeira das rubricas por museu
            </p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeiroPorMuseu} barCategoryGap="35%">
                  <XAxis dataKey="museu" tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="pct" name="Execução" radius={[6, 6, 0, 0]}>
                    {financeiroPorMuseu.map((entry) =>
                  <Cell key={entry.museu} fill={MUSEU_COLORS[entry.museu]} />
                  )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {financeiroPorMuseu.map((f) =>
            <div key={f.museu} className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-center hidden">
                  <p className="text-[10px] text-slate-500 font-semibold">{f.museu}</p>
                  <p className="text-xs font-bold text-slate-800">{fmtBRL(f.utilizado)}</p>
                  <p className="text-[10px] text-slate-400">de {fmtBRL(f.previsto)}</p>
                </div>
            )}
            </div>
          </div>

          {/* ── Metas quantitativas por museu ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Metas quantitativas — atividades por museu (%)
            </p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metasQuantPorMuseu} barCategoryGap="20%" barGap={2}>
                  <XAxis dataKey="meta" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {MUSEUS.map((m) =>
                <Bar key={m} dataKey={m} name={m} fill={MUSEU_COLORS[m]} radius={[4, 4, 0, 0]} />
                )}
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
                  {metasQuantPorMuseu.map((m) =>
                <tr key={m.meta} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 px-2 font-medium text-slate-700">
                        {m.meta} <span className="text-slate-400 font-normal">· {m.desc}</span>
                      </td>
                      <td className="py-1.5 px-2 text-center text-slate-500">{m.total}</td>
                      <td className="py-1.5 px-2 text-center font-semibold text-slate-800">{m.totalAbs}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                    m.totalPct >= 80 ? 'bg-slate-900 text-white' :
                    m.totalPct >= 50 ? 'bg-slate-200 text-slate-800' :
                    'bg-slate-100 text-slate-500'}`
                    }>
                          {m.totalPct}%
                        </span>
                      </td>
                    </tr>
                )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      }

      <DrillDownSheet
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        config={drillDown} />
      
    </div>);

}