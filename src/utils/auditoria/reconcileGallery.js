import { getEntityDate, getMonthKey } from './temporalFilters';
import { getActivityTitle, normalizeMuseu, normalizeText } from './semanticActivityMatcher';

function getPhotoUrl(photo = {}) {
  return photo.url || photo.file_url || photo.download_url || photo.anexo_url || photo.src || photo.link || '';
}

function isImageFile(photo = {}) {
  const url = getPhotoUrl(photo);
  const name = String(photo.nome || photo.name || photo.filename || photo.file_name || url || '').toLowerCase();
  const mime = String(photo.file_type || photo.mime_type || photo.type || '').toLowerCase();

  // Rejeitar claramente não-imagens pelo MIME
  if (mime && !mime.startsWith('image/')) return false;
  // Rejeitar PDFs e XMLs pelo nome/URL
  if (name.endsWith('.pdf') || name.endsWith('.xml') || name.endsWith('.xlsx') || name.endsWith('.docx') || name.endsWith('.doc')) return false;
  // Rejeitar documentos pela URL
  if (url.endsWith('.pdf') || url.endsWith('.xml')) return false;
  // Aceitar formatos de imagem conhecidos
  if (/\.(jpg|jpeg|png|webp|gif|heic|bmp|avif)(\?|$)/i.test(url)) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic|bmp|avif)$/i.test(name)) return true;
  // Se tem MIME de imagem explícito, aceitar
  if (mime.startsWith('image/')) return true;
  // Se não tem MIME e não tem extensão conhecida, verificar se parece PDF pelo nome
  if (name.includes('nf') || name.includes('nota') || name.includes('fiscal') || name.includes('recibo') || name.includes('comprovante')) return false;
  // Padrão: aceitar se não foi rejeitado
  return true;
}

function getPhotoName(photo = {}) {
  const raw = photo.nome || photo.name || photo.filename || photo.file_name || getPhotoUrl(photo).split('/').pop() || 'foto';
  return String(raw).replace(/^whatsapp\s+image\s+/i, '').replace(/\.(jpg|jpeg|png|webp)$/i, '').replace(/[_-]+/g, ' ').trim();
}

function getPhotoKey(photo = {}) {
  const url = getPhotoUrl(photo);
  if (url) return normalizeText(url);
  return normalizeText([getPhotoName(photo), photo.size, photo.created_date].join('|'));
}

export function reconcileGallery(photos = [], activities = []) {
  const activityById = new Map();
  activities.forEach((activity) => {
    if (activity.id) activityById.set(String(activity.id), activity);
    if (activity._auditKey) activityById.set(String(activity._auditKey), activity);
  });

  // Filtrar apenas arquivos de imagem reais — excluir PDFs, XMLs, NFs
  const imageOnlyPhotos = (Array.isArray(photos) ? photos : []).filter(isImageFile);

  const seen = new Map();
  const duplicates = [];
  const orphanPhotos = [];
  const normalized = imageOnlyPhotos.map((photo) => {
    const key = getPhotoKey(photo);
    if (seen.has(key)) duplicates.push({ key, kept: seen.get(key), duplicate: photo });
    else seen.set(key, photo);

    const activityId = photo.activity_id || photo.atividade_id || photo.programacao_id || photo.report_activity_id || photo._activityId;
    const activity = activityId ? activityById.get(String(activityId)) : null;
    if (!activityId && !photo.report_id && !photo.programacao_id) orphanPhotos.push(photo);

    return {
      ...photo,
      _photoKey: key,
      _cleanName: getPhotoName(photo),
      _url: getPhotoUrl(photo),
      _date: getEntityDate(photo),
      _monthKey: getMonthKey(getEntityDate(photo)),
      _activityTitle: activity ? getActivityTitle(activity) : photo.atividade || photo.titulo_atividade || '',
      _museu: normalizeMuseu(photo.museu || activity?._museu || activity?.museu),
      _gps: photo.gps || photo.localizacao_gps || (photo.latitude && photo.longitude ? `${photo.latitude}, ${photo.longitude}` : ''),
      _credit: photo.credito || photo.producao || photo.autor || '',
    };
  });

  return {
    photos: normalized.filter((photo, index, list) => list.findIndex((item) => item._photoKey === photo._photoKey) === index),
    duplicatePhotos: duplicates,
    orphanPhotos,
    totalPhotos: normalized.length,
  };
}