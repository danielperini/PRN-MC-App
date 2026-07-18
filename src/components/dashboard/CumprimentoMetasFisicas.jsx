import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, AlertCircle, TrendingUp, Users, BookOpen } from 'lucide-react';
import { isRelatorioNoPeriodo } from '@/hooks/useMetasPeriodoFiltro';

// Metas com quantitativos físicos definidos no Plano de Trabalho (3º + 4º Aditivo)
const METAS_FISICAS = [
  { numero: '5',  titulo: '60 ações educativas',                   meta: 60,  tipo: 'educativa',  periodo: 'mês 2–18'  },
  { numero: '6',  titulo: '36 ações culturais',                    meta: 36,  tipo: 'cultural',   periodo: 'mês 2–18'  },
  { numero: '10', titulo: '18 mostras de baixa/média complexidade', meta: 18,  tipo: 'mostra',     periodo: 'mês 3–28'  },
  { numero: '16', titulo: '101 diárias de educador',               meta: 101, tipo: 'diaria',     periodo: 'mês 2–28'  },
  { numero: '19', titulo: '"Presente de Iemanjá" (4 ações)',       meta: 4,   tipo: 'iemanja',    periodo: 'mês 6–15'  },
  { numero: '20', titulo: '30 ações educativas e/ou culturais',    meta: 30,  tipo: 'educativa',  periodo: 'mês 19–28' },
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

function classifyActivity(a) {
  const nome = (a.nome || a.titulo || a.descricao || '').toLowerCase();
  const tipo = (a.tipo_acao_lista || []).join(' ').toLowerCase();
  const class_ = (a.classificacao || '').toLowerCase();
  const metaCod = (a.meta_codigo || a.meta_id || '').toLowerCase();

  if (nome.includes('diária') || nome.includes('diaria') || metaCod.includes('16')) return '16';
  if (nome.includes('iemanjá') || nome.includes('iemanja') || metaCod.includes('19')) return '19';
  if (nome.includes('mostra') || tipo.includes('mostra') || metaCod.includes('10')) return '10';
  if (metaCod.includes('20')) return '20';
  if (class_ === 'cultural' || tipo.includes('cultural') || tipo.includes('show') || tipo.includes('teatro') || tipo.includes('apresent') || tipo.includes('música')) return '6';
  if (class_ === 'educativa' || class_ === 'meta' || tipo.includes('educa') || tipo.includes('oficina') || tipo.includes('palestra') || tipo.includes('formação') || tipo.includes('roda')) return '5';

  return null;
}

function getMuseu(a) {
  const lista = Array.isArray(a.museu_lista) ? a.museu_lista : [];
  if (lista.length > 0) return lista[0];
  return a.museu || 'Geral';
}

/**
 * Props:
 *  - dataInicio: { mes: string, ano: number } — opcional; se omitido, conta tudo
 *  - dataFim:    { mes: string, ano: number } — opcional
 */
export default function CumprimentoMetasFisicas({ dataInicio, dataFim }) {
  const { data: relatorios = [], isLoading } = useQuery({
    queryKey: ['reports-para-metas-fisicas'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-ano',
      500
    ),
    staleTime: 60000,
  });

  // Filtrar relatórios por período se filtro passado
  const relatoriosFiltrados = useMemo(() => {
    if (!dataInicio || !dataFim) return relatorios;
    return relatorios.filter(r => isRelatorioNoPeriodo(r.mes_referencia, r.ano, dataInicio, dataFim));
  }, [relatorios, dataInicio, dataFim]);

  const todasAtividades = useMemo(() => {
    const arr = [];
    for (const r of relatoriosFiltrados) {
      for (const a of (r.atividades || [])) {
        arr.push({ ...a, _museu: getMuseu(a) });
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
      const key = classifyActivity(a);
      if (!key || !counts[key]) continue;
      counts[key].total += 1;
      const museu = MUSEUS_ORDEM.includes(a._museu) ? a._museu : 'Geral';
      counts[key].porMuseu[museu] = (counts[key].porMuseu[museu] || 0) + 1;
    }

    return counts;
  }, [todasAtividades]);

  const acoesPorMuseu = useMemo(() => {
    const tot = {};
    for (const m of MUSEUS_ORDEM) tot[m] = 0;
    for (const key of ['5', '6', '20']) {
      if (!stats[key]) continue;
      for (const m of MUSEUS_ORDEM) {
        tot[m] += (stats[key].porMuseu[m] || 0);
      }
    }
    return tot;
  }, [stats]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
      Carregando dados de atividades…
    </div>
  );

  const periodoLabel = dataInicio && dataFim
    ? ` · ${dataInicio.mes}/${dataInicio.ano} – ${dataFim.mes}/${dataFim.ano}`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Cumprimento Físico das Metas</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Atividades realizadas nos relatórios submetidos — 3º e 4º Aditivo{periodoLabel}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {METAS_FISICAS.map((meta) => {
          const realizado = stats[meta.numero]?.total || 0;
          const pct = fmtPct(realizado, meta.meta);
          const porMuseu = stats[meta.numero]?.porMuseu || {};

          return (
            <div key={meta.numero} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
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
                  <div
                    className={`h-2 rounded-full transition-all ${barColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {Object.values(porMuseu).some(v => v > 0) && (
                <div className="grid grid-cols-2 gap-1">
                  {MUSEUS_ORDEM.filter(m => (porMuseu[m] || 0) > 0).map(m => (
                    <div key={m} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
                      <span className="text-[11px] font-medium text-slate-600">{m}</span>
                      <span className="text-[11px] font-bold text-slate-800">{porMuseu[m]}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-400">{meta.periodo}</p>
            </div>
          );
        })}
      </div>

      {/* Ações totais por museu */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-slate-600" />
          <h3 className="text-base font-bold text-slate-800">Total de ações culturais e educativas por museu</h3>
          <span className="ml-auto text-xs text-slate-400">(Metas 5, 6 e 20 combinadas)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MUSEUS_ORDEM.map(museu => (
            <div key={museu} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{museu}</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{acoesPorMuseu[museu] || 0}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">ações</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Educativas (Meta 5)',        valor: stats['5']?.total || 0,  meta: 60,  icon: BookOpen },
            { label: 'Culturais (Meta 6)',          valor: stats['6']?.total || 0,  meta: 36,  icon: TrendingUp },
            { label: 'Ações adicionais (Meta 20)',  valor: stats['20']?.total || 0, meta: 30,  icon: TrendingUp },
          ].map(({ label, valor, meta, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <Icon className="h-5 w-5 text-slate-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500 truncate">{label}</p>
                <p className="text-lg font-bold text-slate-900">{valor} <span className="text-sm font-normal text-slate-400">/ {meta}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}