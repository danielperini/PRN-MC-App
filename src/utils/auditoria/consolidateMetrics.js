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
import { shouldEmitDuplicateActivityIssue } from './activitySemantics';
import { validateExceptionalRubricas } from '@/utils/finance/validateExceptionalRubricas';
import { consolidatePresenceAudience } from '@/utils/presenca/presenceMetrics';

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

function buildDuplicateActivityIssues(duplicates = []) {
  const seen = new Set();
  const items = (Array.isArray(duplicates) ? duplicates : [])
    .filter(shouldEmitDuplicateActivityIssue)
    .map((item) => {
      const entityId = item.duplicate?.id || item.duplicate?._sourceId || item.key;
      const title = item.duplicate?._title || item.kept?._title || item.key;
      const key = [entityId, title].filter(Boolean).join('|');
      if (seen.has(key)) return null;
      seen.add(key);

      return { entityId, title };
    })
    .filter(Boolean);

  if (!items.length) return [];

  return [{
    type: 'DUPLICATE_ACTIVITY',
    severity: 'info',
    message: `${items.length} possível(is) duplicidade(s) pública(s) foram consolidadas pela auditoria para evitar repetição no relatório.`,
    count: items.length,
    entityId: 'duplicate-activities-summary',
    sampleIds: items.slice(0, 20).map((item) => item.entityId).filter(Boolean),
    sampleTitles: items.slice(0, 8).map((item) => item.title).filter(Boolean),
  }];
}

function buildOrphanPhotoIssues(orphanPhotos = []) {
  const photos = Array.isArray(orphanPhotos) ? orphanPhotos : [];
  if (!photos.length) return [];

  return [{
    type: 'PHOTO_WITHOUT_LINK',
    severity: 'info',
    message: `${photos.length} foto(s) sem vínculo claro com atividade foram agrupadas para revisão na galeria final.`,
    count: photos.length,
    entityId: 'orphan-photos-summary',
    sampleIds: photos.slice(0, 20).map((item) => item.id || item.nome || item.name).filter(Boolean),
  }];
}

export function consolidateMetrics(datasets = {}, options = {}) {
  const filter = options.filter || buildTemporalFilter(options.period || {});
  const reports = withReportAuditFields(datasets.reports || []);
  const programacao = datasets.programacao || [];
  const rubricas = datasets.rubricas || [];
  const metas = datasets.metas || [];
  const photos = datasets.photos || datasets.galeria || datasets.attachments || [];
  const presenceRecords = datasets.presenceRecords || datasets.presencas || [];

  const activities = reconcileActivities(reports, programacao, filter);
  const filteredReports = filter?.from || filter?.to
    ? reports.filter((report) => filter.contains(report._date))
    : reports;

  const approvedFilteredReports = filteredReports.filter(isApprovedReport);
  const presenceAudience = consolidatePresenceAudience(presenceRecords, { filter, activities: activities.activities });
  const audience = reconcileAudienceTotals({ reports: approvedFilteredReports, activities: activities.activities, presenceAudience });
  const financeiro = reconcileFinancialTotals(rubricas, options.financeiro || {});
  const gallery = reconcileGallery(photos, activities.activities);

  const reportValidation = validateReports(filteredReports);
  const programacaoValidation = validateProgramacao(programacao);
  const metaValidation = validateMetas({ activities: activities.activities, metas });
  const rubricaValidation = validateRubricas(rubricas);
  const exceptionalRubricaValidation = validateExceptionalRubricas(rubricas);
  const duplicateActivityIssues = buildDuplicateActivityIssues(activities.duplicateActivities);
  const orphanPhotoIssues = buildOrphanPhotoIssues(gallery.orphanPhotos);

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
      duplicateActivitiesForAudit: duplicateActivityIssues,
      consolidatedAudienceGroups: activities.consolidatedAudienceGroups,
      byMonth: groupActivitiesByMonth(activities.activities),
      byMuseum: groupActivitiesByMuseum(activities.activities),
    },
    audience,
    presence: presenceAudience,
    financeiro,
    gallery,
  };

  const dashboardValidation = validateDashboardMetrics(preliminary);
  const issues = [
    ...reportValidation.issues,
    ...programacaoValidation.issues,
    ...metaValidation.issues,
    ...rubricaValidation.issues,
    ...exceptionalRubricaValidation.issues,
    ...financeiro.inconsistencies,
    ...dashboardValidation.issues,
    ...duplicateActivityIssues,
    ...gallery.duplicatePhotos.map((item) => ({
      type: 'DUPLICATE_PHOTO',
      severity: 'info',
      message: `Foto possivelmente duplicada: ${item.duplicate?.nome || item.duplicate?.name || item.key}`,
      entityId: item.duplicate?.id,
    })),
    ...orphanPhotoIssues,
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
