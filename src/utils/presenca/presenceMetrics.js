import { getMonthLabel } from '@/utils/auditoria/temporalFilters';
import { normalizeMuseu } from '@/utils/auditoria/semanticActivityMatcher';
import { deduplicatePresenceRecords, presenceIdentityKey } from './deduplicateParticipants';

export const PUBLICO_TIPOS = [
  'espontâneo',
  'visita agendada',
  'oficina',
  'atividade educativa',
  'ação cultural',
  'evento',
];

export function normalizePresenceDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function getPresenceMonthKey(record = {}) {
  const date = normalizePresenceDate(record.data || record.data_presenca);
  return date ? date.slice(0, 7) : 'sem-mes';
}

export function isPresent(record = {}) {
  const status = String(record.status_presenca || record.presenca || record.status || 'presente').toLowerCase();
  return ['presente', 'sim', 'true', '1', 'assinado', 'confirmado'].includes(status);
}

function getActivityPresenceKey(record = {}) {
  return [
    record.activity_id || record.atividade_id || record.oficina_id || record.lista_presenca_id || '',
    normalizePresenceDate(record.data || record.data_presenca),
  ].join('|');
}

function getActivityDeclaredAudienceMap(activities = []) {
  const map = new Map();
  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    const id = activity.id || activity._sourceId || activity.programacao_id || activity.atividade_id || '';
    const date = normalizePresenceDate(activity.data || activity.data_realizacao || activity._date);
    const publico = Number(activity._publico_contabil ?? activity._publico ?? activity.publico_total ?? activity.publico_estimado ?? 0) || 0;
    if (!id || publico <= 0) return;
    map.set(`${id}|${date}`, Math.max(publico, map.get(`${id}|${date}`) || 0));
    map.set(`${id}|`, Math.max(publico, map.get(`${id}|`) || 0));
  });
  return map;
}

export function consolidatePresenceAudience(records = [], options = {}) {
  const filter = options.filter;
  const activityAudience = getActivityDeclaredAudienceMap(options.activities || []);
  const valid = deduplicatePresenceRecords(records)
    .filter(isPresent)
    .filter((record) => {
      const date = normalizePresenceDate(record.data || record.data_presenca);
      if (!date || !filter?.contains) return true;
      return filter.contains(new Date(`${date}T00:00:00`));
    });

  const groups = new Map();
  valid.forEach((record) => {
    const groupKey = getActivityPresenceKey(record);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(record);
  });

  const byMonthMap = {};
  const byMuseumMap = {};
  const byActivityMap = {};
  let publicoPresencas = 0;
  let duplicidadesEvitadas = Math.max(0, (Array.isArray(records) ? records : []).length - valid.length);

  groups.forEach((items, key) => {
    const declared = activityAudience.get(key) || 0;
    const declaredByActivity = activityAudience.get(`${String(key).split('|')[0]}|`) || 0;
    const counted = Math.max(0, items.length - Math.max(declared, declaredByActivity));
    if (counted <= 0) return;
    publicoPresencas += counted;
    const sample = items[0] || {};
    const monthKey = getPresenceMonthKey(sample);
    const museu = normalizeMuseu(sample.museu || sample.centro_custo || 'Atuação Geral');
    const activityName = sample.atividade_nome || sample.oficina_nome || sample.nome_atividade || 'Presença registrada';

    if (!byMonthMap[monthKey]) byMonthMap[monthKey] = { key: monthKey, mes: getMonthLabel(monthKey), publico_presencas: 0, total: 0 };
    byMonthMap[monthKey].publico_presencas += counted;
    byMonthMap[monthKey].total += counted;

    if (!byMuseumMap[museu]) byMuseumMap[museu] = { museu, publico_presencas: 0, total: 0 };
    byMuseumMap[museu].publico_presencas += counted;
    byMuseumMap[museu].total += counted;

    if (!byActivityMap[key]) byActivityMap[key] = { key, atividade: activityName, museu, data: normalizePresenceDate(sample.data || sample.data_presenca), publico: 0 };
    byActivityMap[key].publico += counted;
  });

  return {
    totalRegistros: records.length || 0,
    registrosValidos: valid.length,
    duplicidadesEvitadas,
    publicoPresencas,
    byMonth: Object.values(byMonthMap).sort((a, b) => String(a.key).localeCompare(String(b.key))),
    byMuseum: Object.values(byMuseumMap).sort((a, b) => a.museu.localeCompare(b.museu)),
    byActivity: Object.values(byActivityMap).sort((a, b) => String(a.data).localeCompare(String(b.data))),
    keys: valid.map(presenceIdentityKey),
  };
}

export default consolidatePresenceAudience;
