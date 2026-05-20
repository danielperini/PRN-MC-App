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
  const safePhoto = photo || {};
  return (
    safePhoto.fileUrl ||
    safePhoto.file_url ||
    safePhoto.url ||
    safePhoto.src ||
    safePhoto.arquivo_original_url ||
    safePhoto.arquivo_url ||
    safePhoto.original_url ||
    safePhoto.imageUrl ||
    safePhoto.image_url ||
    safePhoto.imagem_url ||
    safePhoto.attachment_url ||
    safePhoto.link ||
    ''
  );
}

export function isPhotoImage(photo = {}) {
  const safePhoto = photo || {};
  const url = getPhotoUrl(safePhoto);
  const name = safePhoto.fileName || safePhoto.file_name || safePhoto.name || safePhoto.nome_arquivo || url;
  const ext = String(name).split('.').pop()?.toLowerCase() || '';
  const mime = String(safePhoto.file_type || safePhoto.mime_type || safePhoto.type || '').toLowerCase();

  return IMAGE_EXTENSIONS.includes(ext) || mime.startsWith('image/');
}

export function getPhotoIdentity(photo = {}) {
  const safePhoto = photo || {};
  const url = normalizePhotoUrl(getPhotoUrl(safePhoto));
  if (url) return `url:${url}`;

  const fileName = normalizePhotoFileName(
    safePhoto.fileName ||
    safePhoto.file_name ||
    safePhoto.name ||
    safePhoto.nome_arquivo ||
    ''
  );

  const date = String(
    safePhoto.date ||
    safePhoto.data ||
    safePhoto.created_date ||
    safePhoto.created_at ||
    safePhoto.updated_date ||
    safePhoto.timestamp ||
    safePhoto.metadataDate ||
    ''
  ).slice(0, 10);

  const museum = normalizeText(
    safePhoto.museu ||
    safePhoto.centro_custo ||
    safePhoto.sectionKey ||
    safePhoto.sectionTitle ||
    ''
  );

  const activity = normalizeText(
    safePhoto.linkedActivity?.title ||
    safePhoto.atividade ||
    safePhoto.atividade_nome ||
    safePhoto.nome_atividade ||
    safePhoto.titulo_atividade ||
    ''
  ).slice(0, 100);

  const caption = normalizeText(
    safePhoto.legenda ||
    safePhoto.caption ||
    safePhoto.descricao ||
    safePhoto.description ||
    ''
  ).slice(0, 100);

  const fallback = [fileName, date, museum, activity, caption].filter(Boolean).join('|');

  return fallback || String(safePhoto.attachment_id || safePhoto.attachmentId || safePhoto.sourceId || safePhoto.id || '');
}

export function scorePhotoMetadata(photo = {}) {
  const safePhoto = photo || {};
  return [
    safePhoto.legenda,
    safePhoto.caption,
    safePhoto.descricao,
    safePhoto.description,
    safePhoto.museu,
    safePhoto.centro_custo,
    safePhoto.sectionKey,
    safePhoto.sectionTitle,
    safePhoto.localizacao,
    safePhoto.geoCoordinates,
    safePhoto.metadataCoordinates,
    safePhoto.metadataLocation,
    safePhoto.metadataDate,
    safePhoto.linkedActivity?.title,
    safePhoto.atividade,
    safePhoto.reportLabel,
    safePhoto.author_name,
    safePhoto.autor,
    safePhoto.credito,
    safePhoto.credit,
  ].filter(Boolean).length;
}

function getPhotoTime(photo = {}) {
  const safePhoto = photo || {};
  const date = new Date(safePhoto.timestamp || safePhoto.created_date || safePhoto.created_at || safePhoto.updated_date || safePhoto.date || 0);
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
  if (options.enableVisual !== true) {
    return dedupePhotosByTechnicalIdentity(photos);
  }

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

function waitForIdleFrame() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 200 });
      return;
    }

    setTimeout(resolve, 0);
  });
}

export async function analyzePhotoSimilarityBatch(photos = [], options = {}) {
  const threshold = options.threshold || DEFAULT_SIMILARITY_THRESHOLD;
  const batchSize = Math.min(Math.max(Number(options.batchSize) || 10, 1), 12);
  const maxPhotos = Math.min(Number(options.maxPhotos) || 50, 50);
  const candidates = dedupePhotosByTechnicalIdentity(photos).slice(0, maxPhotos);
  const processed = [];
  const result = [];
  const removed = [];
  const errors = [];
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const hashedBatch = await Promise.all(batch.map(async (photo) => {
      try {
        const visualHash = await createPerceptualHash(photo);
        return { ...photo, visualHash };
      } catch (error) {
        errors.push({
          id: photo?.id || photo?.sourceId,
          message: error?.message || 'Hash visual indisponivel',
        });
        return { ...photo, visualHash: null, visualHashError: error?.message || 'Hash visual indisponivel' };
      }
    }));

    processed.push(...hashedBatch);
    onProgress?.({
      processed: Math.min(index + batch.length, candidates.length),
      total: candidates.length,
      percent: Math.round((Math.min(index + batch.length, candidates.length) / Math.max(1, candidates.length)) * 100),
    });

    await waitForIdleFrame();
  }

  for (const photo of processed) {
    let merged = false;

    for (let index = 0; index < result.length; index += 1) {
      const existing = result[index];
      if (!photo.visualHash || !existing.visualHash) continue;

      const similarity = compareHashes(photo.visualHash, existing.visualHash);
      if (similarity < threshold) continue;

      const best = chooseBestPhoto(existing, photo);
      const other = best === existing ? photo : existing;

      result[index] = {
        ...mergePhotoMetadata(best, other),
        visualHash: best.visualHash || existing.visualHash || photo.visualHash,
        visualSimilarity: similarity,
        visualDuplicate: true,
      };

      removed.push({
        keptId: result[index].id || result[index].sourceId,
        removedId: other.id || other.sourceId,
        keptIdentity: getPhotoIdentity(result[index]),
        removedIdentity: getPhotoIdentity(other),
        similarity,
        reason: 'similaridade_visual',
      });

      merged = true;
      break;
    }

    if (!merged) result.push(photo);
  }

  return {
    photos: result,
    removed,
    errors,
    totalOriginal: candidates.length,
    totalFinal: result.length,
    totalRemoved: removed.length,
  };
}
