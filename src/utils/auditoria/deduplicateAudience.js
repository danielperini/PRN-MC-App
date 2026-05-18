import { getActivityDescription, getActivityTitle, normalizeText } from './semanticActivityMatcher';

export function toAuditNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function toAuditInteger(value) {
  return Math.max(0, Math.round(toAuditNumber(value)));
}

export function getActivityAudience(activity = {}) {
  const direct = toAuditInteger(
    activity.publico_total ??
      activity.publicoTotal ??
      activity.total_publico ??
      activity.publico_estimado ??
      activity.publico ??
      0
  );
  if (direct > 0) return direct;

  const average = toAuditInteger(
    activity.publico_medio_por_sessao ??
      activity.publico_medio_sessao ??
      activity.publico_medio ??
      activity.publico_por_sessao ??
      0
  );
  const occurrences = Math.max(
    toAuditInteger(
      activity.quantas_vezes_ocorreu ??
        activity.quantas_repeticoes ??
        activity.qtd_ocorrencias ??
        activity.ocorrencias ??
        activity.quantidade_ocorrencias ??
        1
    ),
    1
  );

  return average > 0 ? average * occurrences : 0;
}

export function isInternalActivity(activity = {}) {
  const text = normalizeText([
    getActivityTitle(activity),
    getActivityDescription(activity),
    activity.tipo,
    activity.tipo_atividade,
    activity.classificacao,
    activity.categoria,
  ].join(' '));

  return [
    'reuniao',
    'alinhamento',
    'gestao',
    'planejamento interno',
    'atividade interna',
    'filmagem',
    'entrevista interna',
    'prestacao',
    'relatorio',
    'administrativo',
  ].some((word) => text.includes(word));
}

export function isMonthlyConsolidatedAudience(activity = {}) {
  const text = normalizeText([
    getActivityTitle(activity),
    getActivityDescription(activity),
    activity.tipo_atividade,
    activity.classificacao,
  ].join(' '));

  const hasTotal = ['publico geral', 'publico total', 'consolidado', 'balanco mensal', 'resumo mensal'].some((word) => text.includes(word));
  const hasMonth = ['mes', 'mensal', 'competencia'].some((word) => text.includes(word));
  return hasTotal && hasMonth;
}

export function deduplicateAudienceRecords(activities = []) {
  const unique = [];
  const byKey = new Map();
  const duplicates = [];

  activities.forEach((activity) => {
    const key = activity._auditKey || activity.auditKey || activity.id;
    if (!key) {
      unique.push(activity);
      return;
    }

    if (!byKey.has(key)) {
      byKey.set(key, activity);
      unique.push(activity);
      return;
    }

    const current = byKey.get(key);
    duplicates.push({ key, kept: current, duplicate: activity });
    if (getActivityAudience(activity) > getActivityAudience(current)) {
      byKey.set(key, activity);
      const index = unique.indexOf(current);
      if (index >= 0) unique[index] = activity;
    }
  });

  return { uniqueActivities: Array.from(byKey.values()).concat(unique.filter((item) => !item._auditKey && !item.auditKey)), duplicates };
}

export function applyMonthlyConsolidatedAudienceRule(activities = []) {
  const groups = new Map();

  activities.forEach((activity) => {
    const key = [activity._museu, activity._monthKey].filter(Boolean).join('|');
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(activity);
  });

  const consolidatedGroups = [];
  const result = [];

  groups.forEach((items) => {
    const consolidated = items
      .filter(isMonthlyConsolidatedAudience)
      .sort((a, b) => getActivityAudience(b) - getActivityAudience(a))[0];

    if (!consolidated) {
      result.push(...items.map((item) => ({ ...item, _publico_contabil: isInternalActivity(item) ? 0 : getActivityAudience(item) })));
      return;
    }

    consolidatedGroups.push({ key: consolidated._auditKey, total: getActivityAudience(consolidated), items: items.length });
    items.forEach((item) => {
      if (item === consolidated || item._auditKey === consolidated._auditKey) {
        result.push({ ...item, _publico_contabil: getActivityAudience(consolidated), _auditRule: 'consolidado_mensal' });
      } else {
        result.push({ ...item, _publico_contabil: 0, _auditRule: 'ignorado_por_consolidado_mensal' });
      }
    });
  });

  const grouped = new Set(Array.from(groups.values()).flat());
  activities.forEach((activity) => {
    if (!grouped.has(activity)) {
      result.push({ ...activity, _publico_contabil: isInternalActivity(activity) ? 0 : getActivityAudience(activity) });
    }
  });

  return { activities: result, consolidatedGroups };
}
