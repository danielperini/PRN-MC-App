import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { isRelatorioNoPeriodo } from '@/hooks/useMetasPeriodoFiltro';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { useDashboardCriterios, classificarComCriterios } from '@/hooks/useDashboardCriterios';
import DashboardDrilldownSheet, { SectionTitle, RowItem, MuseuBreakdown } from './DashboardDrilldownSheet';
import CriteriosMetaTrigger from './CriteriosMetaTrigger';

const METAS_FISICAS = [
  { numero: '20', titulo: '30 ações educativas e/ou culturais', meta: 30, tipo: 'educativa', periodo: 'mês 19–28' },
];

const MUSEUS_ORDEM = ['MHAB', 'MIS', 'MUMO', 'Geral'];

function fmtPct(v, t) {
  if (!t) return 0;
  return Math.min(100, Math.round((v / t) * 100));
}

function badge(pct) {
  if (pct >= 100) return 'bg-green-100 text-green-800 border-green-200';
  if (pct >= 60)  return 'bg-blue-100 text-blue-800 border-blue-200';
  if (pct >= 30)  return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function barColor(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 60)  return 'bg-blue-500';
  if (pct >= 30)  return 'bg-yellow-400';
  return 'bg-red-400';
}

function classifyActivity(a, criterios) {
  return classificarComCriterios(a, criterios) ? '20' : null;
}

function getMuseu(a) {
  const lista = Array.isArray(a.museu_lista) ? a.museu_lista : [];
  if (lista.length > 0) return lista[0];
  return a.museu || 'Geral';
}

export default function CumprimentoMetasFisicas({ dataInicio, dataFim }) {
  const [sheetMeta, setSheetMeta] = useState(null);   // número da meta ou null
  const [sheetMuseu, setSheetMuseu] = useState(null); // museu filtro ou null (all)

  const { isCoordGeral } = useCurrentUser();
  const { criterios: criteriosMeta20 } = useDashboardCriterios('dashboard_criterios_meta_20');

  const { data: relatorios = [], isLoading } = useQuery({
    queryKey: ['reports-para-metas-fisicas'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-ano',
      500
    ),
    staleTime: 60000,
  });

  const relatoriosFiltrados = useMemo(() => {
    if (!dataInicio || !dataFim) return relatorios;
    return relatorios.filter(r => isRelatorioNoPeriodo(r.mes_referencia, r.ano, dataInicio, dataFim));
  }, [relatorios, dataInicio, dataFim]);

  const todasAtividades = useMemo(() => {
    const arr = [];
    for (const r of relatoriosFiltrados) {
      for (const a of (r.atividades || [])) {
        arr.push({ ...a, _museu: getMuseu(a), _relatorio: r });
      }
    }
    return arr;
  }, [relatoriosFiltrados]);

  const stats = useMemo(() => {
    const counts = {};
    for (const meta of METAS_FISICAS) {
      counts[meta.numero] = { total: 0, porMuseu: {} };
      for (const m of MUSEUS_ORDEM) counts[meta.numero].porMuseu[m] = 0;
    }
    for (const a of todasAtividades) {
      const key = classifyActivity(a, criteriosMeta20);
      if (!key || !counts[key]) continue;
      counts[key].total += 1;
      const museu = MUSEUS_ORDEM.includes(a._museu) ? a._museu : 'Geral';
      counts[key].porMuseu[museu] = (counts[key].porMuseu[museu] || 0) + 1;
    }
    return counts;
  }, [todasAtividades, criteriosMeta20]);

  // Auxiliar: o card 'Geral' usa modo consolidado (soma de todos museus + sem-museu) ou apenas museu=Geral
  const geralConsolidado = criteriosMeta20?.geral_mode === 'consolidado';

  const acoesPorMuseu = useMemo(() => {
    const tot = {};
    for (const m of MUSEUS_ORDEM) tot[m] = 0;
    if (stats['20']) {
      if (geralConsolidado) {
        // 'Geral' exibe o total (consolidado) — soma de todos museus + sem museu específico
        tot['Geral'] = stats['20'].total;
        for (const m of ['MHAB', 'MIS', 'MUMO']) {
          tot[m] += (stats['20'].porMuseu[m] || 0);
        }
      } else {
        for (const m of MUSEUS_ORDEM) {
          tot[m] += (stats['20'].porMuseu[m] || 0);
        }
      }
    }
    return tot;
  }, [stats, geralConsolidado]);

  // Resumo por relatório para drill-down
  const resumoRelatoriosPorMeta = useMemo(() => {
    const map = {};
    for (const a of todasAtividades) {
      const key = classifyActivity(a, criteriosMeta20);
      if (!key) continue;
      const r = a._relatorio;
      if (!r) continue;
      const rid = r.id;
      if (!map[rid]) {
        map[rid] = {
          autor: r.author_name || 'Profissional',
          museu: r.museu || '—',
          mes: r.mes_referencia || '—',
          ano: r.ano || '',
          status: r.status,
          contagens: {},
        };
      }
      map[rid].contagens[key] = (map[rid].contagens[key] || 0) + 1;
    }
    return map;
  }, [todasAtividades, criteriosMeta20]);

  const openSheet = (metaNumero, museu = null) => {
    setSheetMeta(metaNumero);
    setSheetMuseu(museu);
  };

  const closeSheet = () => { setSheetMeta(null); setSheetMuseu(null); };

  const sheetRelatorios = useMemo(() => {
    if (!sheetMeta) return [];
    return Object.values(resumoRelatoriosPorMeta)
      .filter(r => (r.contagens[sheetMeta] || 0) > 0)
      .filter(r => !sheetMuseu || r.museu === sheetMuseu)
      .sort((a, b) => (b.contagens[sheetMeta] || 0) - (a.contagens[sheetMeta] || 0));
  }, [sheetMeta, sheetMuseu, resumoRelatoriosPorMeta]);

  const sheetPorMuseu = useMemo(() => {
    if (!sheetMeta) return {};
    return stats[sheetMeta]?.porMuseu || {};
  }, [sheetMeta, stats]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
      Carregando dados de atividades…
    </div>
  );

  const periodoLabel = dataInicio && dataFim
    ? ` · ${dataInicio.mes}/${dataInicio.ano} – ${dataFim.mes}/${dataFim.ano}`
    : '';

  const cardBase = 'cursor-pointer transition hover:shadow-md hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Cumprimento Físico das Metas</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Atividades realizadas nos relatórios submetidos — 3º e 4º Aditivo{periodoLabel}
          </p>
        </div>
        <CriteriosMetaTrigger
          chave="dashboard_criterios_meta_20"
          atividades={todasAtividades}
          isCoordGeral={isCoordGeral}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {METAS_FISICAS.map((meta) => {
          const realizado = stats[meta.numero]?.total || 0;
          const pct = fmtPct(realizado, meta.meta);
          const porMuseu = stats[meta.numero]?.porMuseu || {};

          return (
            <button
              key={meta.numero}
              type="button"
              onClick={() => openSheet(meta.numero, null)}
              className={`text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 ${cardBase}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {pct >= 100
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    : <AlertCircle className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  }
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">META {meta.numero}</span>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge(pct)}`}>
                  {pct}%
                </span>
              </div>

              <p className="text-sm font-semibold text-slate-800 leading-snug">{meta.titulo}</p>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{realizado} realizada{realizado !== 1 ? 's' : ''}</span>
                  <span>meta: {meta.meta}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {Object.values(porMuseu).some(v => v > 0) && (
                <div className="grid grid-cols-2 gap-1">
                  {MUSEUS_ORDEM.filter(m => (porMuseu[m] || 0) > 0).map(m => (
                    <div
                      key={m}
                      onClick={e => { e.stopPropagation(); openSheet(meta.numero, m); }}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 hover:bg-slate-100 cursor-pointer"
                    >
                      <span className="text-[11px] font-medium text-slate-600">{m}</span>
                      <span className="text-[11px] font-bold text-slate-800">{porMuseu[m]}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-400">{meta.periodo}</p>
            </button>
          );
        })}
      </div>

      {/* Ações totais por museu */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-slate-600" />
          <h3 className="text-base font-bold text-slate-800">Total de ações culturais e educativas por museu</h3>
          <span className="ml-auto text-xs text-slate-400">(Meta 20 — educativas e culturais)</span>
          <CriteriosMetaTrigger
            chave="dashboard_criterios_meta_20"
            atividades={todasAtividades}
            isCoordGeral={isCoordGeral}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MUSEUS_ORDEM.map(museu => (
            <button
              key={museu}
              type="button"
              onClick={() => openSheet('20', museu)}
              className={`rounded-xl border border-slate-100 bg-slate-50 p-3 text-center ${cardBase}`}
            >
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{museu}</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{acoesPorMuseu[museu] || 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">ações</p>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => openSheet('20', null)}
            className={`w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 ${cardBase}`}
          >
            <TrendingUp className="h-5 w-5 text-slate-500 flex-shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-xs text-slate-500 truncate">Ações educativas e culturais (Meta 20)</p>
              <p className="text-lg font-bold text-slate-900">{stats['20']?.total || 0} <span className="text-sm font-normal text-slate-400">/ 30</span></p>
            </div>
          </button>
        </div>
      </div>

      {/* Sheet de drill-down */}
      {sheetMeta && (
        <DashboardDrilldownSheet
          open={!!sheetMeta}
          onClose={closeSheet}
          title={sheetMuseu ? `Meta ${sheetMeta} — ${sheetMuseu}` : `Meta ${sheetMeta} — Atividades Realizadas`}
          value={`${sheetRelatorios.reduce((s, r) => s + (r.contagens[sheetMeta] || 0), 0)} atividades`}
          fontes={['relatorios']}
        >
          {!sheetMuseu && (
            <>
              <SectionTitle>Por museu</SectionTitle>
              <MuseuBreakdown porMuseu={sheetPorMuseu} />
            </>
          )}

          <SectionTitle>
            {sheetRelatorios.length} relatório{sheetRelatorios.length !== 1 ? 's' : ''} contribuindo
            {sheetMuseu ? ` — ${sheetMuseu}` : ''}
          </SectionTitle>
          <div className="space-y-2">
            {sheetRelatorios.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">Nenhum relatório encontrado</p>
            )}
            {sheetRelatorios.map((rel, i) => (
              <RowItem
                key={i}
                label={rel.autor}
                sub={`${rel.museu} · ${rel.mes} ${rel.ano}`}
                value={`${rel.contagens[sheetMeta] || 0} atividades`}
                badge={rel.status === 'APPROVED' ? 'Aprovado' : rel.status === 'SUBMITTED' ? 'Enviado' : rel.status}
              />
            ))}
          </div>
        </DashboardDrilldownSheet>
      )}
    </div>
  );
}