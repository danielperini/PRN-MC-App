import { getEntityDate, getMonthKey, getReportReferenceDate } from './temporalFilters';

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMuseu(value) {
  const text = normalizeText(value).toUpperCase();
  if (text.includes('MIS') || text.includes('IMAGEM') || text.includes('SOM')) return 'MIS';
  if (text.includes('MHAB') || text.includes('ABILIO') || text.includes('HISTORICO')) return 'MHAB';
  if (text.includes('MUMO') || text.includes('MODA')) return 'MUMO';
  if (text.includes('VIADUTO')) return 'Viaduto das Artes';
  return value || 'Atuação Geral';
}

export function getActivityTitle(activity = {}) {
  return (
    activity.nome_atividade ||
    activity.nome_acao ||
    activity.titulo ||
    activity.nome ||
    activity.acao ||
    activity.atividade ||
    activity.evento ||
    'Atividade sem título'
  );
}

export function getActivityDescription(activity = {}) {
  return (
    activity.descricao ||
    activity.descricao_atividade ||
    activity.sinopse ||
    activity.resumo ||
    activity.resultado ||
    activity.resultados ||
    activity.relato ||
    activity.observacoes ||
    ''
  );
}

export function getActivityDate(activity = {}, report = {}) {
  return getEntityDate(activity) || getReportReferenceDate(report);
}

export function getActivityIdentity(activity = {}, report = {}) {
  const explicit =
    activity.programacao_id ||
    activity.programacaoId ||
    activity.id_programacao ||
    activity.agenda_id ||
    activity.activity_id;

  if (explicit) return `programacao:${explicit}`;

  const title = normalizeText(getActivityTitle(activity));
  const date = getActivityDate(activity, report);
  const period = date ? date.toISOString().slice(0, 10) : getMonthKey(getReportReferenceDate(report));
  const museu = normalizeMuseu(activity.museu || activity.centro_custo || report.museu || report.museu_secundario);

  return [title, period, museu].filter(Boolean).join('|');
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 2));
}

export function semanticSimilarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });

  return intersection / Math.max(left.size, right.size);
}

export function likelySameActivity(a = {}, b = {}) {
  const sameExplicit = a.programacao_id && b.programacao_id && String(a.programacao_id) === String(b.programacao_id);
  if (sameExplicit) return true;

  const sameMuseu = normalizeMuseu(a.museu || a._museu) === normalizeMuseu(b.museu || b._museu);
  const dateA = getEntityDate(a) || a._date;
  const dateB = getEntityDate(b) || b._date;
  const sameDay = dateA && dateB && dateA.toISOString().slice(0, 10) === dateB.toISOString().slice(0, 10);
  const titleScore = semanticSimilarity(getActivityTitle(a), getActivityTitle(b));
  const descriptionScore = semanticSimilarity(getActivityDescription(a), getActivityDescription(b));

  return sameMuseu && (sameDay || titleScore > 0.92) && Math.max(titleScore, descriptionScore) > 0.72;
}
