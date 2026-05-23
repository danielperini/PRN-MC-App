import { base44 } from '@/api/base44Client';
import { dedupePhotosByTechnicalIdentity, getPhotoIdentity } from '@/utils/photoSimilarity';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'];
const DEFAULT_CACHE_KEY = 'museus_centro_galeria_fotos_cache_v3_full';
const DEFAULT_TTL = 2 * 60 * 1000;
const DEFAULT_STALE_TTL = 24 * 60 * 60 * 1000;
const ENTITY_TIMEOUT_MS = 12000;

export const MUSEUM_SECTIONS = {
  MHAB: {
    key: 'MHAB',
    title: 'MHAB — Museu Histórico Abílio Barreto',
    shortTitle: 'MHAB',
    coordinates: '-19.936787, -43.947651',
  },
  MIS: {
    key: 'MIS',
    title: 'MIS — Museu da Imagem e do Som de Belo Horizonte',
    shortTitle: 'MIS',
    coordinates: '-19.927057, -43.940157',
  },
  MUMO: {
    key: 'MUMO',
    title: 'MUMO — Museu da Moda de Belo Horizonte',
    shortTitle: 'MUMO',
    coordinates: '-19.924875, -43.937250',
  },
  SEM_IDENTIFICACAO: {
    key: 'SEM_IDENTIFICACAO',
    title: 'Sem identificação de museu',
    shortTitle: 'Sem identificação',
    coordinates: '',
  },
};

export const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'SEM_IDENTIFICACAO'];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isImageByFileName(fileName = '') {
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function isImageByMime(fileType = '') {
  return String(fileType).toLowerCase().startsWith('image/');
}

function firstValue(obj, paths = []) {
  for (const path of paths) {
    const value = String(path)
      .split('.')
      .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function parseMetadata(item = {}) {
  const raw =
    item.metadata ||
    item.meta_data ||
    item.metadados ||
    item.exif ||
    item.image_metadata ||
    item.file_metadata ||
    {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function extractGeoCoordinates(item = {}) {
  const meta = parseMetadata(item);
  const latRaw = firstValue(item, ['latitude', 'lat', 'gps_latitude']) || firstValue(meta, ['latitude', 'lat', 'gps_latitude']);
  const lngRaw = firstValue(item, ['longitude', 'lng', 'lon', 'gps_longitude']) || firstValue(meta, ['longitude', 'lng', 'lon', 'gps_longitude']);
  if (latRaw && lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
  return '';
}

function extractLocation(item = {}) {
  const meta = parseMetadata(item);
  return String(
    firstValue(item, ['localizacao', 'localização', 'location', 'cidade', 'local', 'endereco']) ||
    firstValue(meta, ['localizacao', 'localização', 'location', 'city', 'cidade', 'address', 'place']) ||
    ''
  );
}

function normalizeMuseum(value = '') {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  return '';
}

function resolveSectionKey(item = {}, metadataLocation = '') {
  const values = [
    item.museu,
    item.centro_custo,
    item.local,
    item.localizacao,
    item.descricao,
    item.description,
    item.legenda,
    item.file_name,
    metadataLocation,
  ];
  for (const value of values) {
    const found = normalizeMuseum(value);
    if (found) return found;
  }
  return 'SEM_IDENTIFICACAO';
}

function normalizeDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function mapPhoto(item, sourceEntity = 'Attachment') {
  const metadataLocation = extractLocation(item);
  const metadataCoordinates = extractGeoCoordinates(item);
  const sectionKey = resolveSectionKey(item, metadataLocation);
  const section = MUSEUM_SECTIONS[sectionKey] || MUSEUM_SECTIONS.SEM_IDENTIFICACAO;
  const timestamp = normalizeDate(
    firstValue(item, ['data_foto', 'photo_date', 'taken_at', 'captured_at']) ||
    item.created_at ||
    item.created_date ||
    item.updated_date
  );
  const fileUrl = item.file_url || item.url || item.link || item.src || '';
  const mapped = {
    id: `${sourceEntity.toLowerCase()}-${item.id || item.file_name || timestamp}`,
    sourceId: item.id || item.file_name || '',
    sourceEntity,
    fileUrl,
    fileName: item.file_name || item.filename || item.name || 'imagem',
    legenda: item.legenda || item.caption || item.titulo || item.title || item.descricao || item.description || '',
    description: item.descricao || item.description || '',
    museu: section.shortTitle,
    sectionKey,
    sectionTitle: section.title,
    localizacao: metadataLocation || item.local || item.museu || section.shortTitle,
    geoCoordinates: metadataCoordinates || section.coordinates || '',
    timestamp,
    date: timestamp.split('T')[0],
    reportLabel: sourceEntity,
  };
  return {
    ...mapped,
    duplicateIdentity: getPhotoIdentity(mapped),
  };
}

function readCache(cacheKey, cacheTtlMs, { allowStale = false, staleTtlMs = DEFAULT_STALE_TTL } = {}) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed?.images)) return null;
    const savedAt = Number(parsed.savedAt || 0);
    if (!savedAt) return null;
    const age = Date.now() - savedAt;
    if (age <= cacheTtlMs) return parsed;
    if (allowStale && age <= staleTtlMs) return { ...parsed, cacheStale: true };
    return null;
  } catch {
    return null;
  }
}

function writeCache(cacheKey, data) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      ...data,
    }));
  } catch {
    // cache local é apenas otimização
  }
}

function buildGroups(images = []) {
  const buckets = new Map(SECTION_ORDER.map((key) => [key, []]));
  images.forEach((image) => {
    const key = MUSEUM_SECTIONS[image.sectionKey] ? image.sectionKey : 'SEM_IDENTIFICACAO';
    buckets.get(key).push(image);
  });
  return SECTION_ORDER.map((key) => {
    const section = MUSEUM_SECTIONS[key];
    const sectionImages = buckets.get(key) || [];
    return {
      key,
      sectionTitle: section.title,
      shortTitle: section.shortTitle,
      coordinates: section.coordinates || '',
      images: sectionImages,
    };
  }).filter((group) => group.images.length > 0);
}

function withTimeout(promise, label, timeoutMs = ENTITY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tempo excedido ao carregar ${label}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function safeEntityList(entityName, order, limit, { quietMissing = false } = {}) {
  const entity = base44?.entities?.[entityName];
  if (!entity?.list) {
    if (!quietMissing) console.debug(`[Galeria] ${entityName} não existe no schema atual. Fonte ignorada.`);
    return [];
  }

  try {
    const result = await withTimeout(entity.list(order, limit), entityName);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const message = String(error?.message || error || '');
    const entityMissing = /entity schema|not found in app|schema .* not found/i.test(message);

    if (entityMissing) {
      if (!quietMissing) console.debug(`[Galeria] ${entityName} não existe no schema atual. Fonte ignorada.`);
      return [];
    }

    console.warn(`[Galeria] ${entityName} indisponível. Continuando com as demais fontes.`, error);
    return [];
  }
}

export async function loadGalleryReportData({
  limitMedia = 800,
  limitAttachments = 1200,
  useCache = true,
  cacheKey = DEFAULT_CACHE_KEY,
  cacheTtlMs = DEFAULT_TTL,
  staleCacheTtlMs = DEFAULT_STALE_TTL,
} = {}) {
  if (useCache) {
    const cached = readCache(cacheKey, cacheTtlMs);
    if (cached) return { ...cached, cacheUsed: true };
  }

  const staleCache = useCache
    ? readCache(cacheKey, cacheTtlMs, { allowStale: true, staleTtlMs: staleCacheTtlMs })
    : null;

  const images = [];
  try {
    const mediaEntity = base44?.entities?.MediaLibrary;
    const mediaPromise = mediaEntity?.list
      ? safeEntityList('MediaLibrary', '-created_date', limitMedia, { quietMissing: true })
      : Promise.resolve([]);

    const [media, attachments] = await Promise.all([
      mediaPromise,
      safeEntityList('Attachment', '-created_date', limitAttachments),
    ]);

    if (Array.isArray(media) && media.length) {
      images.push(
        ...media
          .filter((item) => {
            const tipo = String(item?.tipo || '').toLowerCase();
            return tipo === 'imagem' || tipo === 'image' || isImageByMime(item?.file_type) || isImageByFileName(item?.file_name);
          })
          .map((item) => mapPhoto(item, 'MediaLibrary'))
      );
    }

    images.push(
      ...attachments
        .filter((item) => isImageByMime(item?.file_type) || isImageByFileName(item?.file_name))
        .map((item) => mapPhoto(item, 'Attachment'))
    );
  } catch (error) {
    console.warn('[Galeria] Falha geral ao carregar imagens.', error);
  }

  if (!images.length && staleCache) {
    console.warn('[Galeria] Sem resposta nova do Base44. Usando cache antigo da galeria.');
    return { ...staleCache, cacheUsed: true, cacheStale: true };
  }

  const deduped = dedupePhotosByTechnicalIdentity(images)
    .filter((image) => image.fileUrl)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const groups = buildGroups(deduped);
  const imagesByMuseum = groups.reduce((acc, group) => {
    acc[group.key] = group.images.length;
    acc[group.shortTitle] = group.images.length;
    return acc;
  }, {
    MHAB: 0,
    MIS: 0,
    MUMO: 0,
    SEM_IDENTIFICACAO: 0,
    'Sem identificação': 0,
  });

  const payload = {
    images: deduped,
    groups,
    totalImages: deduped.length,
    imagesByMuseum,
    generatedAt: new Date().toISOString(),
    source: 'GaleriaFotos',
    cacheUsed: false,
  };

  if (useCache && deduped.length) writeCache(cacheKey, payload);
  return payload;
}
