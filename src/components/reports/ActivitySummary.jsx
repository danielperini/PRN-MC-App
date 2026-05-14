import React, { useEffect, useMemo, useState } from 'react';
import { Users, Activity, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const APPROVED_STATUSES = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function normalizeText(value) {
  return String(value || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  trim().
  toLowerCase().
  replace(/\s+/g, ' ');
}

function isApprovedReport(report) {
  return APPROVED_STATUSES.has(String(report?.status || '').trim().toUpperCase());
}

function getActivityPublico(activity) {
  const direct = inteiro(activity?.publico_total ?? activity?.publico_estimado ?? activity?.publico ?? 0);
  if (direct > 0) return direct;

  const publicoMedio = inteiro(
    activity?.publico_medio_por_sessao ??
    activity?.publico_medio_sessao ??
    activity?.publico_medio ??
    activity?.publico_por_sessao ??
    0
  );

  const ocorrencias = inteiro(
    activity?.quantas_vezes_ocorreu ??
    activity?.quantas_repeticoes ??
    activity?.qtd_ocorrencias ??
    activity?.ocorrencias ??
    activity?.quantidade_ocorrencias ??
    1
  );

  return publicoMedio * Math.max(ocorrencias, 1);
}

function getActivityKey(activity, report) {
  const explicitId =
  activity?.atividade_id ||
  activity?.programacao_id ||
  activity?.programacaoId ||
  activity?.id_programacao ||
  activity?.agenda_id ||
  activity?.id;

  if (explicitId) return `id:${explicitId}`;

  const title = normalizeText(
    activity?.nome_atividade ||
    activity?.nome ||
    activity?.titulo ||
    activity?.acao ||
    activity?.atividade ||
    ''
  );

  const date = normalizeText(
    activity?.data_realizacao ||
    activity?.data_inicio ||
    activity?.data_fim ||
    activity?.data ||
    report?.mes_referencia ||
    ''
  );

  const museum = normalizeText(activity?.museu || activity?.centro_custo || report?.museu || '');
  const reportPeriod = normalizeText(`${report?.mes_referencia || ''}/${report?.ano || ''}`);

  return [title, date || reportPeriod, museum].filter(Boolean).join('|');
}

function deduplicateActivities(activities) {
  const unique = new Map();
  const repeated = new Map();

  activities.forEach((activity) => {
    const key = activity?._auditKey;
    if (!key) return;

    if (!unique.has(key)) {
      unique.set(key, activity);
      repeated.set(key, 1);
      return;
    }

    repeated.set(key, (repeated.get(key) || 1) + 1);

    const current = unique.get(key);
    const currentPublico = inteiro(current?._publico);
    const nextPublico = inteiro(activity?._publico);

    // Mantém o registro mais completo e, em caso de divergência, o maior público para a mesma atividade real.
    if (nextPublico > currentPublico) {
      unique.set(key, activity);
    }
  });

  const duplicateCount = Array.from(repeated.values()).reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );

  return {
    uniqueActivities: Array.from(unique.values()),
    duplicateCount
  };
}

function buildApprovedSummary(reports) {
  const approvedReports = reports.filter(isApprovedReport);
  const rawActivities = approvedReports.flatMap((report) => {
    const list = Array.isArray(report?.atividades) ? report.atividades : [];
    return list.map((activity) => ({
      ...activity,
      _reportId: report?.id,
      _reportStatus: report?.status,
      _publico: getActivityPublico(activity),
      _auditKey: getActivityKey(activity, report)
    }));
  });

  const { uniqueActivities, duplicateCount } = deduplicateActivities(rawActivities);
  const totalPublico = uniqueActivities.reduce((sum, activity) => sum + inteiro(activity._publico), 0);

  return {
    reports: approvedReports,
    activities: uniqueActivities,
    rawActivities,
    totalPublico,
    totalActivities: uniqueActivities.length,
    duplicateCount
  };
}

// Aceita `reports` (lista de relatórios já carregada pelo pai) para evitar query duplicada.
// Se não forem passados, faz a própria query como fallback.
export default function ActivitySummary({ activities = [], reports: reportsProp }) {
  const [fetchedReports, setFetchedReports] = useState([]);
  const [loading, setLoading] = useState(!reportsProp);

  useEffect(() => {
    // Se o pai já passou os relatórios, não precisa buscar
    if (reportsProp !== undefined) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadApprovedReports = async () => {
      try {
        const data = await base44.entities.Report.list('-updated_date', 1000);
        if (!mounted) return;
        setFetchedReports(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Erro ao carregar relatórios aprovados para resumo:', error);
        if (!mounted) return;
        setFetchedReports([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadApprovedReports();

    const unsubscribe = base44.entities.Report?.subscribe?.(() => {
      loadApprovedReports();
    });

    return () => {
      mounted = false;
      try {unsubscribe?.();} catch {}
    };
  }, [reportsProp]);

  // Usa os relatórios passados pelo pai se disponíveis, senão os buscados
  const reports = reportsProp !== undefined ? reportsProp : fetchedReports;

  const summary = useMemo(() => buildApprovedSummary(reports), [reports]);

  const fallbackSummary = useMemo(() => {
    const safeActivities = Array.isArray(activities) ? activities : [];
    const normalized = safeActivities.map((activity) => ({
      ...activity,
      _publico: getActivityPublico(activity),
      _auditKey: getActivityKey(activity, {})
    }));
    const { uniqueActivities, duplicateCount } = deduplicateActivities(normalized);

    return {
      totalPublico: uniqueActivities.reduce((sum, activity) => sum + inteiro(activity._publico), 0),
      totalActivities: uniqueActivities.length,
      duplicateCount
    };
  }, [activities]);

  const totalPublico = reports.length > 0 ? summary.totalPublico : fallbackSummary.totalPublico;
  const totalActivities = reports.length > 0 ? summary.totalActivities : fallbackSummary.totalActivities;
  const duplicateCount = reports.length > 0 ? summary.duplicateCount : fallbackSummary.duplicateCount;

  if (loading && activities.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Carregando resumo auditado...
      </div>);

  }

  if (!loading && totalActivities === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Nenhuma atividade aprovada para exibir
      </div>);

  }

  return (
    <div className="space-y-3">
      {duplicateCount > 0 &&
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 hidden">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Auditoria detectou {duplicateCount.toLocaleString('pt-BR')} possível(is) atividade(s) repetida(s). O total abaixo já está deduplicado e usa apenas atividades únicas dos relatórios aprovados.
          </span>
        </div>
      }

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
          <Users className="w-7 h-7 text-white mb-2" />
          <p className="text-4xl font-bold text-white leading-none">{inteiro(totalPublico).toLocaleString('pt-BR')}</p>
          <p className="text-sm text-gray-300">Público total alcançado</p>
        </div>

        <div className="rounded-2xl bg-black text-white p-6 flex flex-col gap-1">
          <Activity className="w-7 h-7 text-white mb-2" />
          <p className="text-4xl font-bold text-white leading-none">{inteiro(totalActivities).toLocaleString('pt-BR')}</p>
          <p className="text-sm text-gray-300">Atividades realizadas</p>
        </div>
      </div>
    </div>);

}