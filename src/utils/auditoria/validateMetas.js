import { getActivityMetaForAudit, getExplicitActivityMeta, shouldRequireMeta } from './activitySemantics';

export function validateMetas({ activities = [], metas = [] } = {}) {
  const issues = [];
  const metaKeys = new Set(
    (Array.isArray(metas) ? metas : [])
      .map((meta) => String(meta.id || meta.codigo || meta.nome || meta.titulo || '').toLowerCase())
      .filter(Boolean)
  );

  activities.forEach((activity) => {
    if (!shouldRequireMeta(activity)) return;
    const explicitMeta = getExplicitActivityMeta(activity);
    const meta = getActivityMetaForAudit(activity);
    if (!meta) {
      issues.push({
        type: 'ACTIVITY_WITHOUT_META',
        severity: 'warning',
        message: `Atividade pública sem meta vinculada: ${activity._title || activity.titulo || activity.id}`,
        entityId: activity.id || activity._sourceId,
      });
      return;
    }

    if (explicitMeta && metaKeys.size && !metaKeys.has(meta.toLowerCase())) {
      issues.push({
        type: 'ACTIVITY_META_NOT_FOUND',
        severity: 'info',
        message: `Meta informada não encontrada no cadastro de metas: ${meta}`,
        entityId: activity.id || activity._sourceId,
      });
    }
  });

  return { issues };
}
