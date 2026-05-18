export function validateMetas({ activities = [], metas = [] } = {}) {
  const issues = [];
  const metaKeys = new Set(
    (Array.isArray(metas) ? metas : [])
      .map((meta) => String(meta.id || meta.codigo || meta.nome || meta.titulo || '').toLowerCase())
      .filter(Boolean)
  );

  activities.forEach((activity) => {
    if (activity._isInternal) return;
    const meta = String(activity._meta || activity.meta || activity.meta_aditivo || activity.meta_relacionada || '').trim();
    if (!meta) {
      issues.push({
        type: 'ACTIVITY_WITHOUT_META',
        severity: 'warning',
        message: `Atividade pública sem meta vinculada: ${activity._title || activity.titulo || activity.id}`,
        entityId: activity.id || activity._sourceId,
      });
      return;
    }

    if (metaKeys.size && !metaKeys.has(meta.toLowerCase())) {
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
