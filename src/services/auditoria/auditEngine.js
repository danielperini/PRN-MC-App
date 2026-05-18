import { base44 } from '@/api/base44Client';
import { consolidateMetrics } from '@/utils/auditoria/consolidateMetrics';
import { getOfficialInstitutionalMetrics, loadInstitutionalAuditDatasets } from '@/utils/auditoria/institutionalMetrics';

function buildAuditLogEntries(metrics) {
  return (metrics.issues || []).map((issue) => ({
    action: 'AUDIT_INSTITUTIONAL_DATA',
    entity_type: issue.type,
    entity_id: issue.entityId || null,
    severity: issue.severity || 'info',
    details: issue.message,
    created_at: new Date().toISOString(),
    metadata: {
      expected: issue.expected,
      found: issue.found,
      count: issue.count,
    },
  }));
}

export async function runInstitutionalAudit(options = {}) {
  const datasets = options.datasets || await loadInstitutionalAuditDatasets();
  const metrics = consolidateMetrics(datasets, options);
  return {
    metrics,
    auditLogEntries: buildAuditLogEntries(metrics),
  };
}

export async function synchronizeInstitutionalMetrics(options = {}) {
  const metrics = await getOfficialInstitutionalMetrics(options);
  return {
    metrics,
    synchronizedAt: new Date().toISOString(),
    source: 'Base44',
    mode: 'read-only-consolidation',
  };
}

export async function persistAuditLogEntries(entries = []) {
  if (!base44.entities.AuditLog?.create) return { created: 0, skipped: entries.length };

  let created = 0;
  for (const entry of entries) {
    await base44.entities.AuditLog.create({
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      severity: entry.severity,
      details: entry.details,
      metadata: entry.metadata,
    });
    created += 1;
  }

  return { created, skipped: entries.length - created };
}

export { getOfficialInstitutionalMetrics };
