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
      












      

      




































































































































      

      <DrillDownSheet
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        config={drillDown} />
      
    </div>);

}