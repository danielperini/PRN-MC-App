import { base44 } from '@/api/base44Client';
import { consolidateMetrics } from './consolidateMetrics';

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
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 1000),
    safeList(base44.entities.Programacao, '-data_realizacao', 1000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
    safeList(base44.entities.Meta, 'codigo', 1000),
    safeList(base44.entities.Attachment, '-created_date', 1000),
    safeList(base44.entities.Gallery, '-created_date', 1000),
  ]);

  return {
    reports,
    programacao,
    rubricas,
    metas,
    photos: [...attachments, ...gallery],
  };
}

export async function getOfficialInstitutionalMetrics(options = {}) {
  const datasets = options.datasets || await loadInstitutionalAuditDatasets();
  return consolidateMetrics(datasets, options);
}
