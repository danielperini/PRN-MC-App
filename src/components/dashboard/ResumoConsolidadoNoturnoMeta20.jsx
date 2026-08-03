import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isRelatorioNoPeriodo } from '@/hooks/useMetasPeriodoFiltro';
import { Moon, BookOpen, BarChart3 } from 'lucide-react';
import DrillDownSheet from '@/components/dashboard/DrillDownSheet';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { useDashboardCriterios, classificarComCriterios } from '@/hooks/useDashboardCriterios';
import CriteriosMetaTrigger from './CriteriosMetaTrigger';

/**
 * Classifica a atividade com critérios dinâmicos persistidos.
 * Ordem: noturno primeiro (exclui 11b/pampulha, inclui 11 e 'noturno centro'),
 * depois meta 20 (excluindo noturno/pampulha/diárias).
 */
function classificar(a, critNoturno, critMeta20) {
  if (classificarComCriterios(a, critNoturno)) return 'noturno';
  if (classificarComCriterios(a, critMeta20)) return 'meta20';
  return null;
}

export default function ResumoConsolidadoNoturnoMeta20({ dataInicio, dataFim }) {
  const [drillDown, setDrillDown] = useState(null);
  const { isCoordGeral } = useCurrentUser();
  const { criterios: criteriosNoturno } = useDashboardCriterios('dashboard_criterios_noturno');
  const { criterios: criteriosMeta20 } = useDashboardCriterios('dashboard_criterios_meta_20');

  const { data: relatorios = [], isLoading } = useQuery({
    queryKey: ['reports-resumo-consolidado-noturno-meta20'],
    queryFn: () => base44.entities.Report.filter(
      { status: { $in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] } },
      '-ano', 500
    ),
    staleTime: 60000,
  });

  const relFiltrados = useMemo(() => {
    return (dataInicio && dataFim)
      ? relatorios.filter(r => isRelatorioNoPeriodo(r.mes_referencia, r.ano, dataInicio, dataFim))
      : relatorios;
  }, [relatorios, dataInicio, dataFim]);

  const atividadesFiltradas = useMemo(() => {
    const arr = [];
    for (const r of relFiltrados) {
      for (const a of (r.atividades || [])) {
        arr.push(a);
      }
    }
    return arr;
  }, [relFiltrados]);

  const { totalNoturno, totalMeta20, totalAcumulado } = useMemo(() => {
    let noturno = 0;
    let meta20 = 0;
    for (const a of atividadesFiltradas) {
      const cat = classificar(a, criteriosNoturno, criteriosMeta20);
      if (cat === 'noturno') noturno++;
      else if (cat === 'meta20') meta20++;
    }
    return { totalNoturno: noturno, totalMeta20: meta20, totalAcumulado: noturno + meta20 };
  }, [atividadesFiltradas, criteriosNoturno, criteriosMeta20]);

  if (isLoading) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-slate-600" />
        <h3 className="text-base font-bold text-slate-800">Atividades Consolidadas — Noturno Centro + Meta 20</h3>
        <div className="ml-auto flex items-center gap-1">
          <CriteriosMetaTrigger
            chave="dashboard_criterios_noturno"
            atividades={atividadesFiltradas}
            isCoordGeral={isCoordGeral}
          />
          <CriteriosMetaTrigger
            chave="dashboard_criterios_meta_20"
            atividades={atividadesFiltradas}
            isCoordGeral={isCoordGeral}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Noturno Centro */}
        <button
          type="button"
          onClick={() => setDrillDown({
            title: 'Noturno Centro — META 11',
            value: `${totalNoturno} atividades`,
            sourceBadges: ['Relatórios', 'Atividades'],
            type: 'noturno_meta20',
            relatorios: relFiltrados,
            tipoNoturno: 'noturno',
          })}
          className="rounded-xl border border-slate-100 bg-indigo-50 p-4 text-center cursor-pointer hover:ring-2 hover:ring-indigo-300 hover:bg-indigo-100 transition-all"
        >
          <div className="flex justify-center mb-1">
            <Moon className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Noturno Centro</p>
          <p className="text-4xl font-black text-indigo-700">{totalNoturno}</p>
          <p className="text-[11px] text-indigo-400 mt-0.5">atividades</p>
        </button>

        {/* Meta 20 */}
        <button
          type="button"
          onClick={() => setDrillDown({
            title: 'Ações Educativas — META 20',
            value: `${totalMeta20} atividades`,
            sourceBadges: ['Relatórios', 'Atividades'],
            type: 'noturno_meta20',
            relatorios: relFiltrados,
            tipoNoturno: 'meta20',
          })}
          className="rounded-xl border border-slate-100 bg-emerald-50 p-4 text-center cursor-pointer hover:ring-2 hover:ring-emerald-300 hover:bg-emerald-100 transition-all"
        >
          <div className="flex justify-center mb-1">
            <BookOpen className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Meta 20 — Educativas</p>
          <p className="text-4xl font-black text-emerald-700">{totalMeta20}</p>
          <p className="text-[11px] text-emerald-400 mt-0.5">atividades</p>
        </button>

        {/* Total Acumulado */}
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-center">
          <div className="flex justify-center mb-1">
            <BarChart3 className="h-4 w-4 text-slate-300" />
          </div>
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">Total Acumulado</p>
          <p className="text-4xl font-black text-white">{totalAcumulado}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">atividades</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400 text-center">
        Soma das atividades registradas nos relatórios submetidos — META 11 (Noturno Centro) + META 20 (educativas e culturais)
      </p>

      <DrillDownSheet
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        config={drillDown}
      />
    </div>
  );
}