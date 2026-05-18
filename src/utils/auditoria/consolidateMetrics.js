import { buildTemporalFilter, getMonthKey, getReportReferenceDate } from './temporalFilters';
import { normalizeMuseu } from './semanticActivityMatcher';
import { isApprovedReport, reconcileActivities } from './reconcileActivities';
import { reconcileAudienceTotals } from './reconcileAudienceTotals';
import { reconcileFinancialTotals } from './reconcileFinancialTotals';
import { reconcileGallery } from './reconcileGallery';
import { validateReports } from './validateReports';
import { validateProgramacao } from './validateProgramacao';
import { validateMetas } from './validateMetas';
import { validateRubricas } from './validateRubricas';
import { validateDashboardMetrics } from './validateDashboardMetrics';

function withReportAuditFields(reports = []) {
  return (Array.isArray(reports) ? reports : []).map((report) => {
    const date = getReportReferenceDate(report);
    return {
      ...report,
      _date: date,
      _monthKey: getMonthKey(date),
      _museu: normalizeMuseu(report.museu || report.museu_secundario || report.centro_custo),
    };
  });
}

function groupActivitiesByMonth(activities = []) {
  const map = {};
  activities.forEach((activity) => {
    const key = activity._monthKey || 'sem-mes';
    if (!map[key]) map[key] = { key, atividades: 0, publico: 0 };
    map[key].atividades += 1;
    map[key].publico += Number(activity._publico_contabil || 0);
  });
  return Object.values(map).sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function groupActivitiesByMuseum(activities = []) {
  const map = {};
  activities.forEach((activity) => {
    const museu = activity._museu || 'Atuação Geral';
    if (!map[museu]) map[museu] = { museu, atividades: 0, publico: 0 };
    map[museu].atividades += 1;
    map[museu].publico += Number(activity._publico_contabil || 0);
  });
  return Object.values(map).sort((a, b) => a.museu.localeCompare(b.museu));
}

export function consolidateMetrics(datasets = {}, options = {}) {
  const filter = options.filter || buildTemporalFilter(options.period || {});
  const reports = withReportAuditFields(datasets.reports || []);
  const programacao = datasets.programacao || [];
  const rubricas = datasets.rubricas || [];
  const metas = datasets.metas || [];
  const photos = datasets.photos || datasets.galeria || datasets.attachments || [];

  const activities = reconcileActivities(reports, programacao, filter);
  const filteredReports = filter?.from || filter?.to
    ? reports.filter((report) => filter.contains(report._date))
    : reports;

  const approvedFilteredReports = filteredReports.filter(isApprovedReport);
  const audience = reconcileAudienceTotals({ reports: approvedFilteredReports, activities: activities.activities });
  const financeiro = reconcileFinancialTotals(rubricas, options.financeiro || {});
  const gallery = reconcileGallery(photos, activities.activities);

  const reportValidation = validateReports(filteredReports);
  const programacaoValidation = validateProgramacao(programacao);
  const metaValidation = validateMetas({ activities: activities.activities, metas });
  const rubricaValidation = validateRubricas(rubricas);

  const preliminary = {
    period: filter,
    reports: {
      total: filteredReports.length,
      approved: approvedFilteredReports.length,
      items: filteredReports,
    },
    activities: {
      total: activities.activities.length,
      publicas: activities.publicActivities.length,
      internas: activities.internalActivities.length,
      semMeta: activities.activitiesWithoutMeta.length,
      items: activities.activities,
      duplicateActivities: activities.duplicateActivities,
      consolidatedAudienceGroups: activities.consolidatedAudienceGroups,
      byMonth: groupActivitiesByMonth(activities.activities),
      byMuseum: groupActivitiesByMuseum(activities.activities),
    },
    audience,
    financeiro,
    gallery,
  };

  const dashboardValidation = validateDashboardMetrics(preliminary);
  const issues = [
    ...reportValidation.issues,
    ...programacaoValidation.issues,
    ...metaValidation.issues,
    ...rubricaValidation.issues,
    ...financeiro.inconsistencies,
    ...dashboardValidation.issues,
    ...activities.duplicateActivities.map((item) => ({
      type: 'DUPLICATE_ACTIVITY',
      severity: 'warning',
      message: `Possível duplicidade de atividade: ${item.duplicate?._title || item.key}`,
      entityId: item.duplicate?.id || item.duplicate?._sourceId,
    })),
    ...gallery.duplicatePhotos.map((item) => ({
      type: 'DUPLICATE_PHOTO',
      severity: 'info',
      message: `Foto possivelmente duplicada: ${item.duplicate?.nome || item.duplicate?.name || item.key}`,
      entityId: item.duplicate?.id,
    })),
    ...gallery.orphanPhotos.map((item) => ({
      type: 'PHOTO_WITHOUT_LINK',
      severity: 'info',
      message: `Foto sem vínculo claro com atividade: ${item.nome || item.name || item.id}`,
      entityId: item.id,
    })),
  ];

  const errors = issues.filter((item) => item.severity === 'error').length;
  const warnings = issues.filter((item) => item.severity === 'warning').length;
  const consistencyScore = Math.max(0, Math.round(100 - errors * 12 - warnings * 4 - Math.max(0, issues.length - errors - warnings)));

  return {
    ...preliminary,
    issues,
    summary: {
      consistencyScore,
      status: errors > 0 ? 'red' : warnings > 0 ? 'yellow' : 'green',
      errors,
      warnings,
      infos: issues.length - errors - warnings,
      issueCount: issues.length,
      officialAudience: audience.publicoTotal,
      officialActivities: activities.activities.length,
      officialBudget: financeiro.officialTotal,
      officialUsed: financeiro.totalUtilizado,
    },
  };
}
