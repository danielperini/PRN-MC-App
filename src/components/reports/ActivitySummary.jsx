import React, { useEffect, useMemo, useState } from 'react';
import { Users, Activity, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const APPROVED_STATUSES = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
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
  const title = String(
    activity?.nome_atividade ||
      activity?.nome ||
      activity?.titulo ||
      activity?.acao ||
      activity?.atividade ||
      ''
  )
    .trim()
    .toLowerCase();

  const date = String(
    activity?.data_realizacao ||
      activity?.data_inicio ||
      activity?.data ||
      report?.mes_referencia ||
      ''
  )
    .trim()
    .toLowerCase();

  const museum = String(activity?.museu || activity?.centro_custo || report?.museu || '').trim().toLowerCase();
  const publico = getActivityPublico(activity);

  return [title, date, museum, publico].join('|');
}

function buildApprovedSummary(reports) {
  const approvedReports = reports.filter(isApprovedReport);
  const activities = approvedReports.flatMap((report) => {
    const list = Array.isArray(report?.atividades) ? report.atividades : [];
    return list.map((activity) => ({
      ...activity,
      _reportId: report?.id,
      _reportStatus: report?.status,
      _publico: getActivityPublico(activity),
      _auditKey: getActivityKey(activity, report),
    }));
  });

  const repeated = activities.reduce((acc, activity) => {
    if (!activity._auditKey || activity._auditKey === '|||0') return acc;
    acc[activity._auditKey] = (acc[activity._auditKey] || 0) + 1;
    return acc;
  }, {});

  const duplicateCount = Object.values(repeated).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const totalPublico = activities.reduce((sum, activity) => sum + activity._publico, 0);

  return {
    reports: approvedReports,
    activities,
    totalPublico,
    totalActivities: activities.length,
    duplicateCount,
  };
}

export default function ActivitySummary({ activities = [] }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadApprovedReports = async () => {
      try {
        const data = await base44.entities.Report.list('-updated_date', 1000);
        if (!mounted) return;
        setReports(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Erro ao carregar relatórios aprovados para resumo:', error);
        if (!mounted) return;
        setReports([]);
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
      try {
        unsubscribe?.();
      } catch {}
    };
  }, []);

  const summary = useMemo(() => buildApprovedSummary(reports), [reports]);

  const fallbackSummary = useMemo(() => {
    const safeActivities = Array.isArray(activities) ? activities : [];
    return {
      totalPublico: safeActivities.reduce((sum, activity) => sum + getActivityPublico(activity), 0),
      totalActivities: safeActivities.length,
      duplicateCount: 0,
    };
  }, [activities]);

  const totalPublico = reports.length > 0 ? summary.totalPublico : fallbackSummary.totalPublico;
  const totalActivities = reports.length > 0 ? summary.totalActivities : fallbackSummary.totalActivities;
  const duplicateCount = reports.length > 0 ? summary.duplicateCount : fallbackSummary.duplicateCount;

  if (loading && activities.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Carregando resumo auditado...
      </div>
    );
  }

  if (!loading && totalActivities === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm text-gray-400">
        Nenhuma atividade aprovada para exibir
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {duplicateCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Auditoria detectou {duplicateCount.toLocaleString('pt-BR')} possível(is) atividade(s) repetida(s). O total abaixo segue a soma oficial das atividades dos relatórios aprovados.
          </span>
        </div>
      )}

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
    </div>
  );
}
