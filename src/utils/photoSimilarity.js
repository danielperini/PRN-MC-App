const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const HASH_SIZE = 16;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'];

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getBrowserOrigin() {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://museus-centro.local';
}

export function normalizePhotoUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, getBrowserOrigin());
    url.search = '';
    url.hash = '';
    return decodeURIComponent(url.href).toLowerCase();
  } catch {
    return raw.split('?')[0].split('#')[0].toLowerCase();
  }
}

export function normalizePhotoFileName(value = '') {
  return String(value || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .pop()
    ?.replace(/\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || '';
}

export function getPhotoUrl(photo = {}) {
  return (
    photo.fileUrl ||
    photo.file_url ||
    photo.url ||
    photo.src ||
    photo.arquivo_original_url ||
    photo.arquivo_url ||
    photo.original_url ||
    photo.imageUrl ||
    photo.image_url ||
    photo.imagem_url ||
    photo.attachment_url ||
    photo.link ||
    ''
  );
}

export function isPhotoImage(photo = {}) {
  const url = getPhotoUrl(photo);
  const name = photo.fileName || photo.file_name || photo.name || photo.nome_arquivo || url;
  const ext = String(name).split('.').pop()?.toLowerCase() || '';
  const mime = String(photo.file_type || photo.mime_type || photo.type || '').toLowerCase();

  return IMAGE_EXTENSIONS.includes(ext) || mime.startsWith('image/');
}

export function getPhotoIdentity(photo = {}) {
  const url = normalizePhotoUrl(getPhotoUrl(photo));
  if (url) return `url:${url}`;

  const fileName = normalizePhotoFileName(
    photo.fileName ||
    photo.file_name ||
    photo.name ||
    photo.nome_arquivo ||
    ''
  );

  const date = String(
    photo.date ||
    photo.data ||
    photo.created_date ||
    photo.created_at ||
    photo.updated_date ||
    photo.timestamp ||
    photo.metadataDate ||
    ''
  ).slice(0, 10);

  const museum = normalizeText(
    photo.museu ||
    photo.centro_custo ||
    photo.sectionKey ||
    photo.sectionTitle ||
    ''
  );

  const activity = normalizeText(
    photo.linkedActivity?.title ||
    photo.atividade ||
    photo.atividade_nome ||
    photo.nome_atividade ||
    photo.titulo_atividade ||
    ''
  ).slice(0, 100);

  const caption = normalizeText(
    photo.legenda ||
    photo.caption ||
    photo.descricao ||
    photo.description ||
    ''
  ).slice(0, 100);

  const fallback = [fileName, date, museum, activity, caption].filter(Boolean).join('|');

  return fallback || String(photo.attachment_id || photo.attachmentId || photo.sourceId || photo.id || '');
}

export function scorePhotoMetadata(photo = {}) {
  return [
    photo.legenda,
    photo.caption,
    photo.descricao,
    photo.description,
    photo.museu,
    photo.centro_custo,
    photo.sectionKey,
    photo.sectionTitle,
    photo.localizacao,
    photo.geoCoordinates,
    photo.metadataCoordinates,
    photo.metadataLocation,
    photo.metadataDate,
    photo.linkedActivity?.title,
    photo.atividade,
    photo.reportLabel,
    photo.author_name,
    photo.autor,
    photo.credito,
    photo.credit,
  ].filter(Boolean).length;
}

function getPhotoTime(photo = {}) {
  const date = new Date(photo.timestamp || photo.created_date || photo.created_at || photo.updated_date || photo.date || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function chooseBestPhoto(photoA = {}, photoB = {}) {
  const scoreA = scorePhotoMetadata(photoA);
  const scoreB = scorePhotoMetadata(photoB);

  if (scoreB > scoreA) return photoB;
  if (scoreA > scoreB) return photoA;

  const urlA = Boolean(getPhotoUrl(photoA));
  const urlB = Boolean(getPhotoUrl(photoB));

  if (urlB && !urlA) return photoB;
  if (urlA && !urlB) return photoA;
  if (photoB.reportLabel && !photoA.reportLabel) return photoB;
  if (photoA.reportLabel && !photoB.reportLabel) return photoA;
  if (getPhotoTime(photoB) > getPhotoTime(photoA)) return photoB;

  return photoA;
}

export function mergePhotoMetadata(primary = {}, duplicate = {}) {
  const duplicateSourceId = duplicate.sourceId || duplicate.id || duplicate.attachment_id || duplicate.attachmentId;

  return {
    ...duplicate,
    ...primary,

    legenda: primary.legenda || duplicate.legenda || duplicate.caption,
    caption: primary.caption || duplicate.caption || duplicate.legenda,
    descricao: primary.descricao || duplicate.descricao || duplicate.description,
    description: primary.description || duplicate.description || duplicate.descricao,

    museu: primary.museu || duplicate.museu || duplicate.centro_custo,
    centro_custo: primary.centro_custo || duplicate.centro_custo || duplicate.museu,
    sectionKey: primary.sectionKey || duplicate.sectionKey,
    sectionTitle: primary.sectionTitle || duplicate.sectionTitle,

    localizacao: primary.localizacao || duplicate.localizacao,
    metadataLocation: primary.metadataLocation || duplicate.metadataLocation,
    geoCoordinates: primary.geoCoordinates || duplicate.geoCoordinates,
    metadataCoordinates: primary.metadataCoordinates || duplicate.metadataCoordinates,
    metadataDate: primary.metadataDate || duplicate.metadataDate,

    linkedActivity: primary.linkedActivity || duplicate.linkedActivity,
    atividade: primary.atividade || duplicate.atividade || duplicate.atividade_nome,
    reportLabel: primary.reportLabel || duplicate.reportLabel,
    credito: primary.credito || duplicate.credito || duplicate.autor || duplicate.credit,
    credit: primary.credit || duplicate.credit || duplicate.credito,

    duplicateCount: (primary.duplicateCount || 1) + (duplicate.duplicateCount || 1),
    duplicateSourceIds: Array.from(new Set([
      ...(primary.duplicateSourceIds || []),
      ...(duplicate.duplicateSourceIds || []),
      duplicateSourceId,
    ].filter(Boolean))),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('Imagem sem URL'));
      return;
    }

    if (typeof Image === 'undefined') {
      reject(new Error('API de imagem indisponivel neste ambiente'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Erro ao carregar imagem: ${url}`));
    img.src = url;
  });
}

export async function createPerceptualHash(photo = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Canvas indisponivel neste ambiente');
  }

  const url = getPhotoUrl(photo);
  const img = await loadImage(url);

  const canvas = document.createElement('canvas');
  canvas.width = HASH_SIZE;
  canvas.height = HASH_SIZE;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D indisponivel');

  ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_SIZE);

  const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
  const grayscale = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    grayscale.push(Math.round((r * 0.299) + (g * 0.587) + (b * 0.114)));
  }

  const average = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;

  return grayscale.map((value) => (value >= average ? '1' : '0')).join('');
}

export function compareHashes(hashA = '', hashB = '') {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 0;

  let equal = 0;

  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] === hashB[i]) equal += 1;
  }

  return equal / hashA.length;
}

export function dedupePhotosByTechnicalIdentity(photos = []) {
  const map = new Map();

  for (const photo of Array.isArray(photos) ? photos : []) {
    if (!photo) continue;

    const identity = getPhotoIdentity(photo);
    if (!identity) continue;

    if (!map.has(identity)) {
      map.set(identity, {
        ...photo,
        duplicateIdentity: identity,
        duplicateCount: photo.duplicateCount || 1,
      });
      continue;
    }

    const current = map.get(identity);
    const best = chooseBestPhoto(current, photo);
    const other = best === current ? photo : current;

    map.set(identity, {
      ...mergePhotoMetadata(best, other),
      duplicateIdentity: identity,
      technicalDuplicate: true,
    });
  }

  return Array.from(map.values());
}

export const dedupePhotosByImageIdentity = dedupePhotosByTechnicalIdentity;

export async function dedupePhotosByVisualSimilarity(photos = [], options = {}) {
  const threshold = options.threshold || DEFAULT_SIMILARITY_THRESHOLD;
  const technicalDeduped = dedupePhotosByTechnicalIdentity(photos);
  const processed = [];

  for (const photo of technicalDeduped) {
    try {
      const visualHash = await createPerceptualHash(photo);
      processed.push({ ...photo, visualHash });
    } catch (error) {
      processed.push({ ...photo, visualHash: null, visualHashError: error?.message || 'Hash visual indisponivel' });
    }
  }

  const result = [];
  const removed = [];

  for (const photo of processed) {
    let merged = false;

    for (let i = 0; i < result.length; i += 1) {
      const existing = result[i];
      if (!photo.visualHash || !existing.visualHash) continue;

      const similarity = compareHashes(photo.visualHash, existing.visualHash);

      if (similarity >= threshold) {
        const best = chooseBestPhoto(existing, photo);
        const other = best === existing ? photo : existing;

        result[i] = {
          ...mergePhotoMetadata(best, other),
          visualHash: best.visualHash || existing.visualHash || photo.visualHash,
          visualSimilarity: similarity,
          visualDuplicate: true,
        };

        removed.push({
          keptId: result[i].id || result[i].sourceId,
          removedId: other.id || other.sourceId,
          keptIdentity: getPhotoIdentity(result[i]),
          removedIdentity: getPhotoIdentity(other),
          similarity,
          reason: 'similaridade_visual',
        });

        merged = true;
        break;
      }
    }

    if (!merged) result.push(photo);
  }

  return {
    photos: result,
    removed,
    totalOriginal: Array.isArray(photos) ? photos.length : 0,
    totalFinal: result.length,
    totalRemoved: (Array.isArray(photos) ? photos.length : 0) - result.length,
  };
}
