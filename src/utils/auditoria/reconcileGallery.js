import { getEntityDate, getMonthKey } from './temporalFilters';
import { getActivityTitle, normalizeMuseu, normalizeText } from './semanticActivityMatcher';

function getPhotoUrl(photo = {}) {
  return photo.url || photo.file_url || photo.download_url || photo.anexo_url || photo.src || photo.link || '';
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

  const seen = new Map();
  const duplicates = [];
  const orphanPhotos = [];
  const normalized = (Array.isArray(photos) ? photos : []).map((photo) => {
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
