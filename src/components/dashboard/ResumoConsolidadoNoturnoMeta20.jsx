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
    staleTime: 60000
  });

  const relFiltrados = useMemo(() => {
    return dataInicio && dataFim ?
    relatorios.filter((r) => isRelatorioNoPeriodo(r.mes_referencia, r.ano, dataInicio, dataFim)) :
    relatorios;
  }, [relatorios, dataInicio, dataFim]);

  const atividadesFiltradas = useMemo(() => {
    const arr = [];
    for (const r of relFiltrados) {
      for (const a of r.atividades || []) {
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
      if (cat === 'noturno') noturno++;else
      if (cat === 'meta20') meta20++;
    }
    return { totalNoturno: noturno, totalMeta20: meta20, totalAcumulado: noturno + meta20 };
  }, [atividadesFiltradas, criteriosNoturno, criteriosMeta20]);

  if (isLoading) return null;

  return null;



















































































}