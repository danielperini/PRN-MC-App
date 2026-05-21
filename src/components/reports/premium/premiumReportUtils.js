import { normalizeTextForReport } from '@/utils/reportTextHelpers';
import {
  dedupePhotosByTechnicalIdentity,
  getPhotoIdentity,
  getPhotoUrl,
} from '@/utils/photoSimilarity';

function stripVisibleMarkup(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, '\n')
    .replace(/&lt;\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^&]*&gt;/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ');
}

export function sanitizeReportText(value) {
  return normalizeTextForReport(stripVisibleMarkup(value))
    .replace(/clara\s*assumpcao\s*ctt/gi, 'Clara Braga Assumpção')
    .replace(/clara\s+assumpcao\s+ctt/gi, 'Clara Braga Assumpção')
    .replace(/Clara Braga Assump[cç][aã]o/gi, 'Clara Braga Assumpção')
    .replace(/\bLenado\b/g, 'Leandro Gabriel')
    .replace(/Clara Braga Assumpção\s*Educativo\s*·\s*MUMO/gi, 'Clara Braga Assumpção Educadora · Museus Centro')
    .replace(/\bReunão\b/gi, 'Reunião')
    .replace(/\bEstudio aberto\b/gi, 'Estúdio aberto')
    .replace(/\bmanutençãe\b/gi, 'manutenção')
    .replace(/\bartisticas\b/gi, 'artísticas')
    .replace(/\bas 16h\b/gi, 'às 16h')
    .replace(/destina a apresentação/gi, 'destinada à apresentação')
    .replace(/para a sediar reunião/gi, 'para sediar reunião')
    .replace(/Museus Centro\s+,/gi, 'Museus Centro,')
    .replace(/MUMO\s+,/gi, 'MUMO,')
    .replace(/Viaduto das Artes\s+,/gi, 'Viaduto das Artes –')
    .replace(/CEP 30640-010\s+,/gi, 'CEP 30640-010 –')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/[—–\u0014\u0013\u001d\u001c]/g, ',')
    .replace(/auditoria técnica dos dados/gi, 'tratamento dos dados com apoio de inteligência artificial')
    .replace(/auditoria por inteligência artificial/gi, 'tratamento dos dados com apoio de inteligência artificial')
    .replace(/\brelatorio\b/gi, 'relatório')
    .replace(/\brelatorios\b/gi, 'relatórios')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueParagraphs(value, limit = 8, minLength = 70) {
  const seen = new Set();
  return stripVisibleMarkup(value)
    .replace(/[—–\u0014\u0013\u001d\u001c]/g, ',')
    .replace(/auditoria técnica dos dados/gi, 'tratamento dos dados com apoio de inteligência artificial')
    .replace(/auditoria por inteligência artificial/gi, 'tratamento dos dados com apoio de inteligência artificial')
    .split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/)
    .map(sanitizeReportText)
    .filter((item) => item.length >= minLength)
    .filter((item) => {
      const key = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 150);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmtInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

export function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function cleanText(value) {
  return normalizeTextForReport(stripVisibleMarkup(value))
    .replace(/clara\s*assumpcao\s*ctt/gi, 'Clara Braga Assumpção')
    .replace(/clara\s+assumpcao\s+ctt/gi, 'Clara Braga Assumpção')
    .replace(/Clara Braga Assump[cç][aã]o/gi, 'Clara Braga Assumpção')
    .replace(/\bLenado\b/g, 'Leandro Gabriel')
    .replace(/Clara Braga Assumpção\s*Educativo\s*·\s*MUMO/gi, 'Clara Braga Assumpção Educadora · Museus Centro')
    .replace(/\bReunão\b/gi, 'Reunião')
    .replace(/\bEstudio aberto\b/gi, 'Estúdio aberto')
    .replace(/\bmanutençãe\b/gi, 'manutenção')
    .replace(/\bartisticas\b/gi, 'artísticas')
    .replace(/\bas 16h\b/gi, 'às 16h')
    .replace(/destina a apresentação/gi, 'destinada à apresentação')
    .replace(/para a sediar reunião/gi, 'para sediar reunião')
    .replace(/Museus Centro\s+,/gi, 'Museus Centro,')
    .replace(/MUMO\s+,/gi, 'MUMO,')
    .replace(/Viaduto das Artes\s+,/gi, 'Viaduto das Artes –')
    .replace(/CEP 30640-010\s+,/gi, 'CEP 30640-010 –')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/[—–\u0014\u0013]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function splitParagraphs(value, limit = 6) {
  const seen = new Set();
  const paragraphs = String(value || '')
    .replace(/&lt;\s*br\s*\/?\s*&gt;|<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/&lt;\s*\/p\s*&gt;|<\s*\/p\s*>/gi, '\n\n')
    .replace(/&lt;\s*p[^&]*&gt;|<\s*p[^>]*>/gi, '')
    .replace(/[—–\u0014\u0013]/g, ',')
    .split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/)
    .map(cleanText)
    .filter((item) => item.length > 70)
    .filter((item) => {
      const key = normalizeText(item).slice(0, 180);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return paragraphs.slice(0, limit);
}

export function pickText(...values) {
  return values.map(cleanText).find((item) => item.length > 0) || '';
}

export function monthLabel(value) {
  const raw = cleanText(value);
  if (!raw) return '';

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  }

  return raw;
}

export function cleanFileName(value = '') {
  const raw = String(value || '').split(/[\\/]/).pop().split('?')[0] || '';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}

  return cleanText(decoded)
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/^whatsapp image \d{4}-\d{2}-\d{2} at [\d.]+/i, 'Registro fotográfico')
    .replace(/[_-]+/g, ' ') || 'Registro fotográfico';
}

function isGenericPhotoText(value = '') {
  const text = normalizeText(value);
  return !text ||
    text.includes('whatsapp image') ||
    /^img\s*\d+/.test(text) ||
    /^dsc\s*\d+/.test(text) ||
    text.includes('registro fotografico') ||
    text.includes('arquivo') ||
    text.includes('image');
}

export function buildActivityPhotoCaption(foto = {}) {
  const atividade = pickText(foto?.atividade, foto?.atividade_nome, foto?.titulo_atividade);
  const museu = getMuseuLabel(foto?.museu || foto?.equipamento || '');
  const mes = monthLabel(foto?.mes || foto?.data || foto?.created_date);
  const explicit = pickText(foto?.legenda, foto?.caption, foto?.descricao);

  if (explicit && !isGenericPhotoText(explicit)) return explicit;
  if (atividade) {
    const parts = [atividade, museu, mes].filter(Boolean);
    return `Registro da atividade ${parts.join(' · ')}.`;
  }
  if (museu || mes) return `Registro visual vinculado ao ${[museu || 'Museus Centro', mes].filter(Boolean).join(' · ')}.`;
  return 'Registro visual vinculado às atividades do Museus Centro.';
}

export function getPhotoCredit(foto = {}) {
  return pickText(
    foto.credito,
    foto.creditos,
    foto.credit,
    foto.credits,
    foto.foto_credito,
    foto.credito_foto,
    foto.creditos_foto,
    foto.fotografo,
    foto.fotografa,
    foto.photographer,
    foto.autor_foto,
    foto.autoria,
    foto.author_name,
    foto.uploaded_by_name
  );
}

export function getPhotoLocation(foto = {}) {
  const nested = foto.localizacao || foto.location || foto.geolocation || {};
  const latitude = pickText(
    foto.latitude,
    foto.lat,
    foto.gps_latitude,
    foto.gps_lat,
    nested.latitude,
    nested.lat
  );
  const longitude = pickText(
    foto.longitude,
    foto.lng,
    foto.lon,
    foto.gps_longitude,
    foto.gps_lng,
    foto.gps_lon,
    nested.longitude,
    nested.lng,
    nested.lon
  );
  const endereco = pickText(
    foto.endereco,
    foto.address,
    foto.localizacao_texto,
    foto.location_name,
    foto.local,
    nested.endereco,
    nested.address,
    nested.label
  );

  const hasCoordinates = latitude && longitude;

  return {
    latitude,
    longitude,
    endereco,
    label: hasCoordinates ? `${latitude}, ${longitude}` : endereco,
    mapUrl: hasCoordinates ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : '',
  };
}

export function getActivityTitle(activity = {}) {
  return pickText(
    activity.nome,
    activity.titulo,
    activity.nome_acao,
    activity.atividade,
    activity.descricao?.slice?.(0, 90)
  ) || 'Atividade registrada';
}

export function getActivityText(activity = {}) {
  return pickText(
    activity.descricao,
    activity.resumo,
    activity.sinopse_agenda,
    activity.observacoes,
    activity.comentarios
  );
}

export function getActivityDate(activity = {}) {
  return pickText(activity.data, activity.data_inicio, activity.data_realizacao, activity.mes);
}

export function getActivityMeta(activity = {}) {
  return pickText(
    activity.meta,
    activity.meta_relacionada,
    activity.codigo_meta,
    activity.classificacao,
    activity.categoria_label,
    activity.tipo_acao
  );
}

export function getActivityPublico(activity = {}) {
  const n = toNumber(activity.publico ?? activity.publico_total ?? activity.publico_estimado);
  return n > 0 ? n : 0;
}

export function normalizeDateToDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

export function normalizeActivityTitle(value) {
  return normalizeText(value)
    .replace(/^\d+_\d+_/, '')
    .replace(/[“”"'🎥📸]/g, '')
    .replace(/[:;,.!?()[\]{}\-–—_/\\]/g, ' ')
    .replace(/\b(producao museus centro|produção museus centro|producao mumo|produção mumo|laboratorio|laboratório|oficina|encontro|atividade|acao|ação|visita|museu criativo)\b/g, ' ')
    .replace(/\b(com|ministrado por|com a artista|com o artista)\b.*$/g, ' ')
    .replace(/\b(a|o|as|os|um|uma|de|da|do|das|dos|em|no|na)\b/g, ' ')
    .replace(/\bpoeticas\b/g, 'poetica')
    .replace(/\bhistorias\b/g, 'historia')
    .replace(/\s+/g, ' ')
    .trim();
}

function activityTokens(value = '') {
  return normalizeActivityTitle(value).split(' ').filter((word) => word.length > 2);
}

function activityTokenSimilarity(a = '', b = '') {
  const left = new Set(activityTokens(a));
  const right = new Set(activityTokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.max(left.size, right.size);
}

function getActivityDescription(activity = {}) {
  return pickText(activity.texto, activity.descricao, activity.sinopse, activity.sinopse_agenda, activity.description, activity.observacoes);
}

function getActivityLocation(activity = {}) {
  return pickText(activity.local, activity.endereco, activity.location, activity.espaco, activity.museu);
}

function getActivityStatus(activity = {}) {
  return pickText(activity.status, activity.tipo, activity.classificacao, activity.categoria_label);
}

export function classifyActivityNature(activity = {}) {
  const text = normalizeText([
    getActivityTitle(activity),
    getActivityText(activity),
    activity.texto,
    activity.descricao,
    getActivityStatus(activity),
    activity.tipo,
    activity.categoria_label,
  ].filter(Boolean).join(' '));

  if (/\b(reuniao|ritual de gestao|alinhamento|contato interno|contatos internos)\b/.test(text)) return 'GESTAO_REUNIAO';
  if (/\b(manutencao|lampada|vidracaria|infraestrutura|orcamentacao|conserto|reparo)\b/.test(text)) return 'MANUTENCAO_INFRA';
  if (/\b(fechamento do relatorio|relatorio mensal|documentacao de relatorio)\b/.test(text)) return 'DOCUMENTACAO_RELATORIO';
  if (/\b(visita tecnica|uso do espaco|vitral podcast)\b/.test(text)) return 'VISITA_TECNICA_USO_ESPACO';
  if (/\b(comunicacao|cobertura|clipping|rede social|redes sociais|postagem|peca digital|audiovisual|edicao|video)\b/.test(text)) return 'COMUNICACAO';
  if (/\b(producao|apoio|montagem|organizacao|recepcao|bastidor)\b/.test(text)) return 'PRODUCAO';
  if (/\b(visita mediada|visitas mediadas|grupo agendado|mediacao)\b/.test(text)) return 'VISITA_MEDIADA';
  if (/\b(sarau|prosas|mostra|exposicao|evento cultural|show|apresentacao)\b/.test(text)) return 'PROGRAMACAO_CULTURAL';
  if (/\b(oficina|laboratorio|laboratório|minicurso|curso|formacao|intervencao educativa|estudio aberto)\b/.test(text)) return 'PUBLICA_EDUCATIVA';
  if (/\b(rotina|interno|administrativo)\b/.test(text)) return 'ROTINA_INTERNA';
  return 'PROGRAMACAO_CULTURAL';
}

export function activityNatureLabel(nature = '') {
  const labels = {
    PUBLICA_EDUCATIVA: 'Atividade pública educativa',
    VISITA_MEDIADA: 'Visita mediada',
    PROGRAMACAO_CULTURAL: 'Programação cultural',
    PRODUCAO: 'Produção',
    COMUNICACAO: 'Comunicação',
    GESTAO_REUNIAO: 'Gestão e reunião',
    MANUTENCAO_INFRA: 'Manutenção e infraestrutura',
    DOCUMENTACAO_RELATORIO: 'Documentação e relatório',
    VISITA_TECNICA_USO_ESPACO: 'Visita técnica / uso do espaço',
    ROTINA_INTERNA: 'Rotina interna',
  };
  return labels[nature] || 'Atividade registrada';
}

export function buildActivityDedupKey(activity = {}) {
  const title = normalizeActivityTitle(getActivityTitle(activity));
  const date = normalizeDateToDay(getActivityDate(activity));
  const museum = normalizeText(getMuseuLabel(activity.museu || activity.equipamento || activity.centro || activity.centro_custo || activity.local));
  const desc = normalizeText(getActivityDescription(activity)).slice(0, 120);
  return [title, date, museum, desc].filter(Boolean).join('|');
}

export function areActivitiesSimilar(a = {}, b = {}) {
  const titleA = normalizeActivityTitle(getActivityTitle(a));
  const titleB = normalizeActivityTitle(getActivityTitle(b));
  if (!titleA || !titleB) return false;

  const dateA = normalizeDateToDay(getActivityDate(a));
  const dateB = normalizeDateToDay(getActivityDate(b));
  const museumA = normalizeText(getMuseuLabel(a.museu || a.equipamento || a.local));
  const museumB = normalizeText(getMuseuLabel(b.museu || b.equipamento || b.local));
  const descA = normalizeText(getActivityDescription(a)).slice(0, 160);
  const descB = normalizeText(getActivityDescription(b)).slice(0, 160);
  const locA = normalizeText(getActivityLocation(a));
  const locB = normalizeText(getActivityLocation(b));
  const metaA = normalizeText(getActivityMeta(a));
  const metaB = normalizeText(getActivityMeta(b));
  const titleSimilarity = activityTokenSimilarity(titleA, titleB);

  let score = 0;
  if (dateA && dateB && dateA === dateB) score += 40;
  if (museumA && museumB && museumA === museumB) score += 25;
  if (titleA === titleB) score += 35;
  else if (titleA.includes(titleB) || titleB.includes(titleA)) score += 25;
  else if (titleSimilarity >= 0.72) score += 25;
  if (descA && descB && (descA === descB || descA.includes(descB.slice(0, 80)) || descB.includes(descA.slice(0, 80)))) score += 20;
  if (locA && locB && locA === locB) score += 10;
  if (metaA && metaB && metaA === metaB) score += 10;

  if (score >= 70) return true;
  return score >= 50 && titleSimilarity >= 0.72 && Boolean((dateA && dateA === dateB) || (museumA && museumA === museumB));
}

function activityCompleteness(activity = {}) {
  const photos = [activity.fotos, activity.fotos_destaque, activity.anexos, activity.attachments]
    .flatMap((item) => Array.isArray(item) ? item : [])
    .length;
  const status = normalizeText(getActivityStatus(activity));
  return Object.values(activity).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length +
    (status.includes('confirm') || status.includes('aprov') || status.includes('realiz') ? 20 : 0) +
    (getActivityPublico(activity) > 0 ? 12 : 0) +
    Math.min(photos, 8);
}

function mergeArraysUnique(left = [], right = []) {
  return uniqueBy([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])], (item) => getPhotoIdentity(item) || item?.id || item?.url || item?.file_url || JSON.stringify(item).slice(0, 160));
}

function editorialMergedTitle(items = [], fallback = '') {
  const normalized = normalizeText(items.map(getActivityTitle).join(' '));
  if (normalized.includes('argila') && normalized.includes('movimento') && normalized.includes('poetic')) return 'Laboratório: Poéticas da Argila em Movimento';
  if (normalized.includes('mulheres') && normalized.includes('ecoam') && normalized.includes('historia')) return 'Museu Criativo: Mulheres que Ecoam História';
  if (normalized.includes('pintando') && normalized.includes('tempo')) return 'Museu Criativo: Pintando o Tempo';
  if (normalized.includes('criacao') && normalized.includes('cenario')) return 'Oficina Criação de Cenários';
  if (normalized.includes('costurando') && normalized.includes('bem querer')) return 'Oficina Costurando Bem Querer';
  return items.map(getActivityTitle).sort((a, b) => b.length - a.length)[0] || fallback || 'Atividade registrada';
}

export function mergeActivities(a = {}, b = {}) {
  const items = [a, b].filter(Boolean).sort((left, right) => activityCompleteness(right) - activityCompleteness(left));
  const merged = { ...items[0] };
  const other = items[1] || {};

  Object.entries(other).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = mergeArraysUnique(merged[key], value);
    } else if ((merged[key] === null || merged[key] === undefined || String(merged[key]).trim() === '') && value !== null && value !== undefined && String(value).trim() !== '') {
      merged[key] = value;
    }
  });

  ['fotos', 'fotos_destaque', 'anexos', 'attachments'].forEach((key) => {
    merged[key] = mergeArraysUnique(a[key], b[key]);
  });

  const title = editorialMergedTitle(items, getActivityTitle(merged));
  const hasGuiliana = /guiliana\s+danza|giuliana\s+danza/i.test(items.map((item) => [getActivityTitle(item), getActivityDescription(item)].join(' ')).join(' '));
  const descriptionParts = uniqueParagraphs(items.map(getActivityDescription).filter(Boolean).join('\n\n'), 4, 30);
  if (hasGuiliana && !descriptionParts.some((text) => /guiliana\s+danza|giuliana\s+danza/i.test(text))) {
    descriptionParts.unshift('Com Guiliana Danza.');
  }
  const nature = classifyActivityNature(merged);

  return {
    ...merged,
    titulo: title,
    nome: title,
    descricao: descriptionParts.join('\n\n') || merged.descricao || merged.texto || merged.sinopse,
    texto: descriptionParts.join('\n\n') || merged.texto || merged.descricao || merged.sinopse,
    publico: Math.max(getActivityPublico(a), getActivityPublico(b), toNumber(a.publico), toNumber(b.publico)),
    data: normalizeDateToDay(getActivityDate(merged)) || getActivityDate(merged),
    activityNature: nature,
    tipo: activityNatureLabel(nature),
    consolidatedCount: toNumber(a.consolidatedCount || 1) + toNumber(b.consolidatedCount || 1),
  };
}

export function dedupeReportActivities(activities = []) {
  const result = [];
  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    if (!activity) return;
    const nature = activity.activityNature || classifyActivityNature(activity);
    const normalizedActivity = {
      ...activity,
      activityNature: nature,
      tipo: activityNatureLabel(nature) || activity.tipo,
    };
    const index = result.findIndex((existing) => areActivitiesSimilar(existing, normalizedActivity));
    if (index >= 0) result[index] = mergeActivities(result[index], normalizedActivity);
    else result.push(normalizedActivity);
  });

  const removed = (Array.isArray(activities) ? activities.length : 0) - result.length;
  if (removed > 0 && typeof console !== 'undefined' && console.debug) {
    console.debug(`Atividades consolidadas no relatório: ${removed} duplicidades removidas.`);
  }
  return result;
}

export function dedupeReportActivitiesStrict(activities = []) {
  const seen = new Set();
  const result = [];

  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    if (!activity) return;

    const id = activity.id || activity._id || activity.activity_id || activity.atividade_id || activity.programacao_id;
    const title = normalizeText(getActivityTitle(activity));
    const date = normalizeDateToDay(getActivityDate(activity));
    const museum = normalizeText(getMuseuLabel(activity.museu || activity.equipamento || activity.centro || activity.centro_custo || activity.local));
    const key = id ? `id:${id}` : (title && date && museum ? `strict:${date}:${museum}:${title}` : '');

    if (!key) {
      result.push(activity);
      return;
    }

    if (seen.has(key)) return;
    seen.add(key);
    result.push(activity);
  });

  return result;
}

export function getMuseuLabel(value) {
  const text = normalizeText(value);
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'Noturno nos Museus';
  return value || 'Atuação geral';
}

export function uniqueBy(items = [], keyFn = (item) => item?.id || item?.url || JSON.stringify(item)) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupePhotosByImageIdentity(photos = []) {
  return dedupePhotosByTechnicalIdentity(photos);
}

export { getPhotoIdentity, getPhotoUrl };

function getLegacyPhotoIdentity(photo = {}) {
  const rawUrl = cleanText(
    photo?.arquivo_original_url ||
    photo?.original_url ||
    photo?.fileUrl ||
    photo?.url ||
    photo?.file_url ||
    photo?.src ||
    photo?.link ||
    photo?.imagem_url ||
    photo?.attachment_url ||
    ''
  );

  if (!rawUrl) return '';

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://museus-centro.local';
    const url = new URL(rawUrl, origin);
    url.search = '';
    url.hash = '';
    return decodeURIComponent(url.pathname || rawUrl).toLowerCase();
  } catch {
    return rawUrl.split('?')[0].split('#')[0].toLowerCase();
  }
}

function getPhotoSelectionKeys(photo = {}) {
  return [
    getPhotoIdentity(photo),
    getLegacyPhotoIdentity(photo),
    photo?.id,
    photo?.attachment_id,
    photo?.attachmentId,
    photo?.sourceId,
    photo?.url,
    photo?.file_url,
    photo?.fileUrl,
    photo?.src,
    photo?.arquivo_original_url,
    photo?.link,
  ].filter(Boolean).map((item) => String(item));
}

export function prepareInlineAndGalleryPhotos(allPhotos = [], selectedInlinePhotoIds = []) {
  const dedupedPhotos = dedupePhotosByImageIdentity(allPhotos);
  const selectedSet = new Set((Array.isArray(selectedInlinePhotoIds) ? selectedInlinePhotoIds : []).filter(Boolean).map((item) => String(item)));
  const inlinePhotos = [];
  const galleryPhotos = [];
  const seenInline = new Set();
  const seenGallery = new Set();

  dedupedPhotos.forEach((photo) => {
    const key = getPhotoIdentity(photo);
    if (!key) return;
    const isSelectedInline = getPhotoSelectionKeys(photo).some((selectionKey) => selectedSet.has(selectionKey));

    if (isSelectedInline) {
      if (seenInline.has(key)) return;
      seenInline.add(key);
      inlinePhotos.push(photo);
      return;
    }

    if (seenGallery.has(key)) return;
    seenGallery.add(key);
    galleryPhotos.push(photo);
  });

  return {
    selectedSet,
    inlinePhotos,
    galleryPhotos,
  };
}

export function groupGalleryPhotosByMuseumMonthActivity(galleryPhotos = []) {
  const museumMap = new Map();

  dedupePhotosByImageIdentity(galleryPhotos).forEach((photo) => {
    const museumRaw = cleanText(photo?.museu || photo?.museum || '');
    const monthRaw = cleanText(photo?.mes || photo?.month || '');
    const activityRaw = cleanText(photo?.atividade || photo?.atividade_nome || photo?.titulo_atividade || photo?.titulo || '');

    const museum = museumRaw || 'Fotos sem classificação completa';
    const month = monthRaw || 'Período sem classificação';
    const activity = activityRaw || 'Fotos sem atividade vinculada';

    if (!museumMap.has(museum)) museumMap.set(museum, new Map());
    const monthMap = museumMap.get(museum);
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const activityMap = monthMap.get(month);
    if (!activityMap.has(activity)) activityMap.set(activity, []);

    const list = activityMap.get(activity);
    const key = getPhotoIdentity(photo);
    if (!list.some((item) => getPhotoIdentity(item) === key)) {
      list.push(photo);
    }
  });

  return Array.from(museumMap.entries())
    .map(([museu, monthMap]) => ({
      museu,
      months: Array.from(monthMap.entries())
        .map(([mes, activityMap]) => ({
          mes,
          activities: Array.from(activityMap.entries())
            .map(([atividade, photos]) => ({
              atividade,
              photos,
            }))
            .sort((a, b) => a.atividade.localeCompare(b.atividade, 'pt-BR')),
        }))
        .sort((a, b) => a.mes.localeCompare(b.mes, 'pt-BR')),
    }))
    .sort((a, b) => a.museu.localeCompare(b.museu, 'pt-BR'));
}

export function extractPhotos(contexto = {}, limit = Infinity) {
  const fromContext = Array.isArray(contexto.fotos) ? contexto.fotos : [];
  const fromActivities = (Array.isArray(contexto.atividades) ? contexto.atividades : [])
    .flatMap((atividade) => [
      ...(Array.isArray(atividade.fotos_destaque) ? atividade.fotos_destaque : []),
      ...(Array.isArray(atividade.fotos) ? atividade.fotos : []),
    ].map((foto) => ({
      ...foto,
      atividade: getActivityTitle(atividade),
      mes: atividade?.mes || monthLabel(getActivityDate(atividade)),
      museu: atividade?.museu || foto?.museu,
      meta: getActivityMeta(atividade),
    })));
  const fromReports = (Array.isArray(contexto.relatorios_equipe) ? contexto.relatorios_equipe : [])
    .flatMap((report) => Array.isArray(report.fotos) ? report.fotos.map((foto) => ({
      ...foto,
      mes: report?.mes,
      museu: report?.museu || foto?.museu,
    })) : []);

  return dedupePhotosByImageIdentity([...fromContext, ...fromActivities, ...fromReports]
    .filter(Boolean)
    .map((foto) => {
      const url = getPhotoUrl(foto);
      return {
        ...foto,
        url,
        legenda: buildActivityPhotoCaption(foto),
        museu: getMuseuLabel(foto?.museu || foto?.equipamento || foto?.origem || ''),
        credito: getPhotoCredit(foto),
        localizacao: getPhotoLocation(foto),
        atividade: pickText(foto?.atividade, foto?.atividade_nome, foto?.titulo),
        mes: monthLabel(foto?.mes || foto?.data || foto?.created_date),
        meta: pickText(foto?.meta, foto?.meta_relacionada),
        fileName: cleanFileName(foto?.fileName || foto?.file_name || foto?.name || url),
        link: url,
      };
    }))
    .filter((foto) => /^https?:\/\//.test(foto.url) || foto.url.startsWith('/'))
    .slice(0, Number.isFinite(limit) ? limit : undefined);
}

export function groupByMuseu(atividades = []) {
  const base = { MHAB: [], MIS: [], MUMO: [], 'Atuação geral': [] };
  atividades.forEach((atividade) => {
    const museu = getMuseuLabel(atividade?.museu || atividade?.equipamento);
    const key = base[museu] ? museu : 'Atuação geral';
    base[key].push(atividade);
  });
  return base;
}

export function buildTimelineItems(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const programacao = Array.isArray(contexto.programacao) ? contexto.programacao : [];

  return dedupeReportActivitiesStrict([
    ...programacao.map((item) => ({
      data: pickText(item.data, item.data_inicio),
      titulo: pickText(item.titulo, item.nome_acao, 'Programação registrada'),
      museu: getMuseuLabel(item.museu || item.equipamento),
      tipo: pickText(item.tipo, item.tipo_atividade, item.status, 'Programação'),
      texto: pickText(item.sinopse, item.descricao),
      publico: getActivityPublico(item),
      meta: getActivityMeta(item),
    })),
    ...atividades.map((item) => ({
      data: getActivityDate(item),
      titulo: getActivityTitle(item),
      museu: getMuseuLabel(item.museu),
      tipo: pickText(item.classificacao, item.categoria_label, 'Atividade'),
      texto: getActivityText(item),
      publico: getActivityPublico(item),
      meta: getActivityMeta(item),
    })),
  ])
    .filter((item) => item.titulo);
}

export function buildMetrics(contexto = {}) {
  const dashboard = contexto?.dashboard_metrics || contexto?.dashboardMetrics || contexto?.metricas_dashboard || {};
  const monthRows = Array.isArray(dashboard?.activities?.byMonth) ? dashboard.activities.byMonth : [];
  const aprilRow = monthRows.find((row) => {
    const key = normalizeText(row?.key || row?.month || row?.mes || '');
    return key.includes('2026-04') || key.includes('abril');
  });
  const approvedReports = toNumber(dashboard?.reports?.approved ?? contexto.total_relatorios);
  const activitiesApril = toNumber(aprilRow?.atividades ?? dashboard?.activities?.approvedInMonth ?? dashboard?.activities?.approved ?? contexto.total_atividades);
  const publicoAtividades = toNumber(
    dashboard?.audience?.publicoTotal ??
    contexto.publico_total ??
    contexto.publico_atividades_total ??
    contexto.publico_atividades
  );
  const programacaoTotal = toNumber(dashboard?.programacao?.total ?? contexto.programacao_total);
  const equipeTotal = toNumber(dashboard?.equipe?.total ?? contexto.equipe_total);
  const execucaoPct = toNumber(dashboard?.financeiro?.percentualExecucao ?? contexto.percentual_execucao);
  const total = toNumber(contexto.valor_utilizado) + toNumber(contexto.saldo);
  return [
    { label: 'Relatórios aprovados', value: fmtInt(approvedReports), detail: 'base narrativa consolidada' },
    { label: 'Atividades', value: fmtInt(activitiesApril), detail: 'atividades em abril (aprovados)' },
    { label: 'Público em atividades', value: fmtInt(publicoAtividades), detail: 'somente atividades com público registrado' },
    { label: 'Programação', value: fmtInt(programacaoTotal), detail: 'agenda recuperada' },
    { label: 'Equipe', value: fmtInt(equipeTotal), detail: 'profissionais com relatório' },
    { label: 'Execução', value: `${execucaoPct.toFixed(1).replace('.', ',')}%`, detail: fmtBRL(total) },
  ];
}
