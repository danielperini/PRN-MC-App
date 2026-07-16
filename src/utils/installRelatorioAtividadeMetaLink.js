import { base44 } from '@/api/base44Client';

const REPORT_ENTITIES = ['RelatorioAtividade', 'ActivityReport', 'RelatorioMensalAtividade'];
const ACTIVITY_ENTITIES = ['Programacao', 'Activity', 'Atividade', 'Evento'];
const META_ENTITIES = ['ProjectMeta', 'MetaProjeto', 'Meta'];
const ACTIVITY_ID_FIELDS = ['activity_id', 'atividade_id', 'evento_id', 'programacao_id', 'agenda_id', 'acao_id'];
const META_ID_FIELDS = ['meta_id', 'project_meta_id', 'meta_projeto_id', 'metaId', 'meta_codigo', 'codigo_meta'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function first(item, fields) {
  for (const field of fields) if (item?.[field] !== undefined && item?.[field] !== null && text(item[field])) return item[field];
  return '';
}

function activityId(item = {}) {
  return text(first(item, ACTIVITY_ID_FIELDS) || item?.atividade?.id || item?.activity?.id || item?.evento?.id || item?.programacao?.id);
}

function metaId(item = {}) {
  return text(first(item, META_ID_FIELDS) || item?.meta?.id || item?.project_meta?.id || item?.meta_projeto?.id);
}

function metaName(item = {}) {
  return text(item?.meta_nome || item?.nome_meta || item?.meta_titulo || item?.meta?.nome || item?.project_meta?.nome || item?.meta_projeto?.nome);
}

function title(item = {}) {
  return normalize(item?.titulo || item?.nome_atividade || item?.atividade_nome || item?.nome || item?.descricao || '');
}

async function safeList(entityName, order = '-created_date', limit = 10000) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    const rows = await entity.list(order, limit);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

let contextPromise;
async function loadContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const [activities, metas] = await Promise.all([
      Promise.all(ACTIVITY_ENTITIES.map((name) => safeList(name))).then((rows) => rows.flat()),
      Promise.all(META_ENTITIES.map((name) => safeList(name, 'ordem', 5000))).then((rows) => rows.flat()),
    ]);

    const activityById = new Map();
    const activityByTitle = new Map();
    for (const activity of activities) {
      const id = text(activity.id || activity._id);
      if (id) activityById.set(id, activity);
      const key = title(activity);
      if (key && !activityByTitle.has(key)) activityByTitle.set(key, activity);
    }

    const metaById = new Map();
    const metaByName = new Map();
    for (const meta of metas) {
      const id = text(meta.id || meta.meta_id || meta.codigo || meta.meta_codigo);
      const name = text(meta.meta_nome || meta.nome || meta.titulo || meta.descricao);
      if (id) metaById.set(id, meta);
      if (name && !metaByName.has(normalize(name))) metaByName.set(normalize(name), meta);
    }

    return { activityById, activityByTitle, metaById, metaByName };
  })();
  return contextPromise;
}

async function enrichReport(report = {}) {
  if (metaId(report)) return report;
  const context = await loadContext();
  const linkedActivity = context.activityById.get(activityId(report)) || context.activityByTitle.get(title(report));
  const inheritedId = linkedActivity ? metaId(linkedActivity) : '';
  const inheritedName = linkedActivity ? metaName(linkedActivity) : '';
  const officialMeta = (inheritedId && context.metaById.get(inheritedId)) || (inheritedName && context.metaByName.get(normalize(inheritedName)));
  const resolvedId = text(officialMeta?.id || officialMeta?.meta_id || inheritedId);
  const resolvedName = text(officialMeta?.meta_nome || officialMeta?.nome || officialMeta?.titulo || inheritedName);
  if (!resolvedId && !resolvedName) return report;
  return {
    ...report,
    meta_id: resolvedId || report.meta_id,
    meta_nome: resolvedName || report.meta_nome,
    meta_vinculada_por: 'atividade_agenda',
    meta_vinculo_resolvido: true,
  };
}

async function enrichRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return Promise.all(rows.map(enrichReport));
}

function wrapReadMethod(entity, methodName) {
  if (!entity?.[methodName] || entity[`__metaLink_${methodName}`]) return;
  const original = entity[methodName].bind(entity);
  entity[methodName] = async (...args) => {
    const result = await original(...args);
    if (Array.isArray(result)) return enrichRows(result);
    if (Array.isArray(result?.data)) return { ...result, data: await enrichRows(result.data) };
    return enrichReport(result);
  };
  entity[`__metaLink_${methodName}`] = true;
}

export function installRelatorioAtividadeMetaLink() {
  if (typeof window === 'undefined' || window.__relatorioAtividadeMetaLinkInstalled) return;
  window.__relatorioAtividadeMetaLinkInstalled = true;
  for (const entityName of REPORT_ENTITIES) {
    const entity = base44.entities?.[entityName];
    wrapReadMethod(entity, 'list');
    wrapReadMethod(entity, 'filter');
    wrapReadMethod(entity, 'get');
  }
}
