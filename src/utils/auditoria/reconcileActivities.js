import { getMonthKey, getReportReferenceDate } from './temporalFilters';
import { getActivityDate, getActivityIdentity, getActivityTitle, normalizeMuseu } from './semanticActivityMatcher';
import { applyMonthlyConsolidatedAudienceRule, deduplicateAudienceRecords, getActivityAudience, isInternalActivity } from './deduplicateAudience';
import { classifyAuditActivityNature, getActivityMetaForAudit, isOperationalActivityForAudit, isPublicActivityForAudit, shouldRequireMeta } from './activitySemantics';

export const APPROVED_REPORT_STATUSES = new Set([
  'APPROVED',
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
  'APROVADO_COORDENACAO',
]);

export function normalizeStatus(status) {
  return String(status || '').trim().toUpperCase();
}

export function isApprovedReport(report = {}) {
  return APPROVED_REPORT_STATUSES.has(normalizeStatus(report.status));
}

export function extractReportActivities(report = {}) {
  const reportDate = getReportReferenceDate(report);
  const reportMonthKey = getMonthKey(reportDate);
  const activities = Array.isArray(report.atividades) ? report.atividades : [];

  return activities.map((activity, index) => {
    const date = getActivityDate(activity, report);
    const museu = normalizeMuseu(activity.museu || activity.centro_custo || report.museu || report.museu_secundario);
    const activityNature = classifyAuditActivityNature(activity);
    const internal = isInternalActivity(activity) || isOperationalActivityForAudit({ ...activity, _activityNature: activityNature });
    return {
      ...activity,
      _source: 'Report',
      _sourceId: report.id,
      _sourceTitle: report.titulo || report.nome || report.mes_referencia || report.mes,
      _activityIndex: index,
      _title: getActivityTitle(activity),
      _date: date,
      _monthKey: getMonthKey(date) || reportMonthKey,
      _reportMonthKey: reportMonthKey,
      _reportMonthNumber: reportDate ? reportDate.getMonth() + 1 : null,
      _reportYear: reportDate ? reportDate.getFullYear() : null,
      _museu: museu,
      _auditKey: getActivityIdentity(activity, report),
      _publico: getActivityAudience(activity),
      _isInternal: internal,
      _activityNature: activityNature,
      _meta: getActivityMetaForAudit(activity),
    };
  });
}

export function reconcileActivities(reports = [], programacao = [], filter = null) {
  const approvedReports = (Array.isArray(reports) ? reports : []).filter(isApprovedReport);
  const rawActivities = approvedReports.flatMap(extractReportActivities);
  const filteredRaw = filter?.from || filter?.to
    ? rawActivities.filter((activity) => filter.contains(activity._date))
    : rawActivities;

  const { uniqueActivities, duplicates } = deduplicateAudienceRecords(filteredRaw);
  const { activities, consolidatedGroups } = applyMonthlyConsolidatedAudienceRule(uniqueActivities);
  const programacaoAtiva = (Array.isArray(programacao) ? programacao : []).filter((item) => {
    const status = normalizeStatus(item.status || item.situacao);
    return !['CANCELADO', 'CANCELADA', 'INATIVO', 'INATIVA'].includes(status);
  });

  return {
    approvedReports,
    rawActivities: filteredRaw,
    activities,
    programacaoAtiva,
    duplicateActivities: duplicates,
    consolidatedAudienceGroups: consolidatedGroups,
    publicActivities: activities.filter((activity) => isPublicActivityForAudit(activity)),
    internalActivities: activities.filter((activity) => activity._isInternal),
    activitiesWithoutMeta: activities.filter((activity) => shouldRequireMeta(activity) && !activity._meta),
  };
}
