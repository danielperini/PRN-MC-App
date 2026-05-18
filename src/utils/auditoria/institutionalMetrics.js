import { base44 } from '@/api/base44Client';
import { consolidateMetrics } from './consolidateMetrics';
import { buildTemporalFilter, endOfDay, startOfDay } from './temporalFilters';

async function safeList(entity, order = '-updated_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Auditoria: falha ao listar entidade', error);
    return [];
  }
}

export async function loadInstitutionalAuditDatasets() {
  const [
    reports,
    programacao,
    rubricas,
    metas,
    attachments,
    gallery,
    presenceRecords,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 1000),
    safeList(base44.entities.Programacao, '-data_realizacao', 1000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
    safeList(base44.entities.Meta, 'codigo', 1000),
    safeList(base44.entities.Attachment, '-created_date', 1000),
    safeList(base44.entities.Gallery, '-created_date', 1000),
    safeList(base44.entities.PresenceRecord, '-data', 3000),
  ]);

  return {
    reports,
    programacao,
    rubricas,
    metas,
    photos: [...attachments, ...gallery],
    presenceRecords,
  };
}

export async function getOfficialInstitutionalMetrics(options = {}) {
  const datasets = options.datasets || await loadInstitutionalAuditDatasets();
  return consolidateMetrics(datasets, options);
}

export function getOfficialDashboardPeriod(referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const start = startOfDay(new Date(2026, 1, 1));
  const end = endOfDay(new Date(ref.getFullYear(), ref.getMonth(), 0));

  return buildTemporalFilter({
    from: start,
    to: end,
    mode: 'dashboard-oficial',
  });
}

export function consolidateOfficialDashboardMetrics(datasets = {}, options = {}) {
  return consolidateMetrics(datasets, {
    ...options,
    period: options.period || getOfficialDashboardPeriod(options.referenceDate),
  });
}
