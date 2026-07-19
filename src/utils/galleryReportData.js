import { base44 } from '@/api/base44Client';
import { dedupePhotosByTechnicalIdentity, getPhotoIdentity } from '@/utils/photoSimilarity';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'];
const DEFAULT_CACHE_KEY = 'museus_centro_galeria_fotos_cache_v12_deduped';

// Limpar versões antigas do cache ao importar este módulo
try {
  ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'drive_fallback'].forEach((suffix) => {
    const oldKeys = [
      `museus_centro_galeria_fotos_cache_${suffix}`,
      `museus_centro_galeria_fotos_cache_v6_${suffix}`,
    ];
    oldKeys.forEach((k) => localStorage.removeItem(k));
  });
} catch { /* noop */ }
const DEFAULT_TTL = 2 * 60 * 1000;
const DEFAULT_STALE_TTL = 24 * 60 * 60 * 1000;
const ENTITY_TIMEOUT_MS = 25000;

export const MUSEUM_SECTIONS = {
  MHAB: { key: 'MHAB', title: 'MHAB — Museu Histórico Abílio Barreto', shortTitle: 'MHAB', coordinates: '-19.936787, -43.947651' },
  MIS: { key: 'MIS', title: 'MIS — Museu da Imagem e do Som de Belo Horizonte', shortTitle: 'MIS', coordinates: '-19.927057, -43.940157' },
  MUMO: { key: 'MUMO', title: 'MUMO — Museu da Moda de Belo Horizonte', shortTitle: 'MUMO', coordinates: '-19.924875, -43.937250' },
  MAP: { key: 'MAP', title: 'MAP — Museu de Arte da Pampulha', shortTitle: 'MAP', coordinates: '-19.856, -43.966' },
  CasaKubitschek: { key: 'CasaKubitschek', title: 'Casa Kubitschek', shortTitle: 'Casa Kubitschek', coordinates: '-19.857, -43.968' },
  CasaDoBalile: { key: 'CasaDoBalile', title: 'Casa do Baíle', shortTitle: 'Casa do Baíle', coordinates: '-19.860, -43.967' },
  SEM_IDENTIFICACAO: { key: 'SEM_IDENTIFICACAO', title: 'Sem identificação de museu', shortTitle: 'Sem identificação', coordinates: '' },
};
export const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile', 'SEM_IDENTIFICACAO'];

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function isImageByFileName(fileName = '') {
  return IMAGE_EXTENSIONS.includes(String(fileName).split('.').pop()?.toLowerCase() || '');
}
function isImageByMime(fileType = '') {
  return String(fileType).toLowerCase().startsWith('image/');
}
function isMacResourceFork(item = {}) {
  return String(item.file_name || item.filename || item.name || '').trim().startsWith('._');
}
function firstValue(obj, paths = []) {
  for (const path of paths) {
    const value = String(path).split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function parseMetadata(item = {}) {
  const raw = item.metadata || item.meta_data || item.metadados || item.exif || item.image_metadata || item.file_metadata || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function parseDriveContext(item = {}) {
  const raw = item.contexto_ia || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}
function extractGeoCoordinates(item = {}) {
  const meta = parseMetadata(item);
  const latRaw = firstValue(item, ['latitude', 'lat', 'gps_latitude']) || firstValue(meta, ['latitude', 'lat', 'gps_latitude']);
  const lngRaw = firstValue(item, ['longitude', 'lng', 'lon', 'gps_longitude']) || firstValue(meta, ['longitude', 'lng', 'lon', 'gps_longitude']);
  const lat = Number(latRaw); const lng = Number(lngRaw);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '';
}
function extractLocation(item = {}) {
  const meta = parseMetadata(item);
  return String(firstValue(item, ['localizacao', 'localização', 'location', 'cidade', 'local', 'endereco']) || firstValue(meta, ['localizacao', 'localização', 'location', 'city', 'cidade', 'address', 'place']) || '');
}
function normalizeMuseum(value = '') {
  const text = normalizeText(value);
  if (text.includes('mhab') || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('map') || text.includes('pampulha') || text.includes('arte da pampulha')) return 'MAP';
  if (text.includes('kubitschek') || text.includes('jk')) return 'CasaKubitschek';
  if (text.includes('baile') || text.includes('baíle') || text.includes('bale') || text.includes('casa do b')) return 'CasaDoBalile';
  return '';
}
function resolveSectionKey(item = {}, metadataLocation = '') {
  const values = [item.museu, item.centro_custo, item.local, item.localizacao, item.descricao, item.description, item.legenda, item.caption, item.file_name, metadataLocation];
  for (const value of values) { const found = normalizeMuseum(value); if (found) return found; }
  return 'SEM_IDENTIFICACAO';
}
function normalizeDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function extractActivityFromName(fileName = '') {
  const match = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  return match ? match[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '';
}
function extractDriveFileId(item = {}, rawUrl = '') {
  const explicit = item.drive_file_id || item.google_drive_file_id;
  if (explicit) return String(explicit).trim();
  const url = String(rawUrl || '');
  const pathMatch = url.match(/\/file\/d\/([^/?#]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];
  const queryMatch = url.match(/[?&]id=([^&#]+)/i);
  if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]);
  return '';
}
function isDrivePageUrl(url = '') {
  return /drive\.google\.com\/(file\/d\/|open\?|uc\?)/i.test(String(url));
}
function resolvePhotoSource(item = {}) {
  const rawUrl = String(item.file_url || item.url || item.link || item.src || '').trim();
  const driveFileId = extractDriveFileId(item, rawUrl);
  const thumbnail = String(item.thumbnail_url || item.thumbnailLink || item.drive_thumbnail_url || '').trim();
  const candidates = [];

  if (rawUrl && !isDrivePageUrl(rawUrl)) candidates.push(rawUrl);
  if (thumbnail) candidates.push(thumbnail);
  if (driveFileId) {
    candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600`);
    candidates.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=w1600`);
  }
  if (rawUrl) candidates.push(rawUrl);

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  return {
    fileUrl: uniqueCandidates[0] || '',
    fallbackUrls: uniqueCandidates.slice(1),
    originalFileUrl: rawUrl,
    driveFileId,
    legacyDriveUrl: Boolean(rawUrl && isDrivePageUrl(rawUrl)),
  };
}
function mapPhoto(item, sourceEntity = 'Attachment') {
  const metadataLocation = extractLocation(item);
  const sectionKey = resolveSectionKey(item, metadataLocation);
  const section = MUSEUM_SECTIONS[sectionKey] || MUSEUM_SECTIONS.SEM_IDENTIFICACAO;
  const driveContext = parseDriveContext(item);
  const timestamp = normalizeDate(firstValue(item, ['data_foto', 'photo_date', 'taken_at', 'captured_at', 'date_taken']) || driveContext.data_foto || item.created_at || item.created_date || item.updated_date);
  const source = resolvePhotoSource(item);
  const fileName = item.file_name || item.filename || item.name || 'imagem';
  const mapped = {
    id: `${sourceEntity.toLowerCase()}-${item.id || source.driveFileId || fileName || timestamp}`,
    sourceId: item.id || source.driveFileId || fileName || '',
    sourceEntity,
    fileUrl: source.fileUrl,
    fallbackUrls: source.fallbackUrls,
    originalFileUrl: source.originalFileUrl,
    legacyDriveUrl: source.legacyDriveUrl,
    fileName,
    legenda: item.legenda || item.caption || item.titulo || item.title || item.descricao || item.description || extractActivityFromName(fileName),
    description: item.descricao || item.description || item.caption || '',
    museu: section.shortTitle,
    sectionKey,
    sectionTitle: section.title,
    localizacao: metadataLocation || item.local || item.museu || section.shortTitle,
    geoCoordinates: extractGeoCoordinates(item) || section.coordinates || '',
    timestamp,
    date: timestamp.split('T')[0],
    reportLabel: sourceEntity,
    reportMes: item.mes_referencia ? `${item.mes_referencia}${item.ano ? `/${item.ano}` : ''}` : '',
    authorName: item.author || item.author_name || '',
    activityTitulo: item.atividade_titulo || item.activity_title || driveContext.atividade_nome || '',
    driveFileId: source.driveFileId,
  };
  return { ...mapped, duplicateIdentity: getPhotoIdentity(mapped) };
}
function readCache(cacheKey, cacheTtlMs, { allowStale = false, staleTtlMs = DEFAULT_STALE_TTL } = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (!parsed || !Array.isArray(parsed.images) || !parsed.savedAt) return null;
    const age = Date.now() - Number(parsed.savedAt);
    if (age <= cacheTtlMs) return parsed;
    return allowStale && age <= staleTtlMs ? { ...parsed, cacheStale: true } : null;
  } catch { return null; }
}
function writeCache(cacheKey, data) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), ...data })); } catch { /* cache opcional */ }
}
function buildGroups(images = []) {
  const buckets = new Map(SECTION_ORDER.map((key) => [key, []]));
  images.forEach((image) => buckets.get(MUSEUM_SECTIONS[image.sectionKey] ? image.sectionKey : 'SEM_IDENTIFICACAO').push(image));
  return SECTION_ORDER.map((key) => ({ key, sectionTitle: MUSEUM_SECTIONS[key].title, shortTitle: MUSEUM_SECTIONS[key].shortTitle, coordinates: MUSEUM_SECTIONS[key].coordinates || '', images: buckets.get(key) || [] })).filter((group) => group.images.length);
}
function withTimeout(promise, label, timeoutMs = ENTITY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Tempo excedido ao carregar ${label}`)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function safeEntityList(entityName, order, limit, { quietMissing = false } = {}) {
  const entity = base44?.entities?.[entityName];
  if (!entity?.list) return [];
  try {
    const result = await withTimeout(entity.list(order, limit), entityName);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    if (!quietMissing || status !== 404) console.warn(`[Galeria] ${entityName} indisponível.`, error);
    return [];
  }
}

// Busca TODOS os registros paginando de PAGE_SIZE em PAGE_SIZE até não restar mais
const PAGE_SIZE = 500;
async function fetchAllPages(entityName, order, { quietMissing = false } = {}) {
  const entity = base44?.entities?.[entityName];
  if (!entity?.filter) {
    // fallback para list com limite alto
    return safeEntityList(entityName, order, 9999, { quietMissing });
  }
  const all = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    try {
      const page = await withTimeout(
        entity.filter({}, order, PAGE_SIZE, skip),
        `${entityName} p${skip / PAGE_SIZE + 1}`,
        20000
      );
      const items = Array.isArray(page) ? page : [];
      all.push(...items);
      if (items.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        skip += PAGE_SIZE;
      }
    } catch (error) {
      const status = Number(error?.response?.status || error?.status || 0);
      if (!quietMissing || status !== 404) console.warn(`[Galeria] ${entityName} falha na paginação skip=${skip}.`, error);
      hasMore = false;
    }
  }
  return all;
}

export async function loadGalleryReportData({
  limitMedia = 0,
  limitAttachments = 0, // 0 = sem limite (paginação automática)
  useCache = true,
  cacheKey = DEFAULT_CACHE_KEY,
  cacheTtlMs = DEFAULT_TTL,
  staleCacheTtlMs = DEFAULT_STALE_TTL,
} = {}) {
  void limitMedia;
  void limitAttachments; // ignorado — sempre busca tudo via paginação
  if (useCache) {
    const cached = readCache(cacheKey, cacheTtlMs);
    if (cached) return { ...cached, cacheUsed: true };
  }
  const staleCache = useCache ? readCache(cacheKey, cacheTtlMs, { allowStale: true, staleTtlMs: staleCacheTtlMs }) : null;
  const images = [];
  try {
    const [attachments, reportPhotos] = await Promise.all([
      fetchAllPages('Attachment', '-created_date'),
      fetchAllPages('ReportPhoto', '-created_date', { quietMissing: true }),
    ]);
    images.push(...attachments.filter((item) => item?.file_url && !isMacResourceFork(item) && (isImageByMime(item.file_type) || isImageByFileName(item.file_name))).map((item) => mapPhoto(item, 'Attachment')));
    images.push(...reportPhotos.filter((item) => item?.file_url && !isMacResourceFork(item) && (isImageByMime(item.file_type) || isImageByFileName(item.file_name) || /^https?:/i.test(item.file_url))).map((item) => mapPhoto(item, 'ReportPhoto')));
  } catch (error) {
    console.warn('[Galeria] Falha geral ao carregar imagens.', error);
  }
  if (!images.length && staleCache) return { ...staleCache, cacheUsed: true, cacheStale: true };
  // Deduplicação primária por identidade técnica
  const deduped1 = dedupePhotosByTechnicalIdentity(images).filter((image) => image.fileUrl);
  // Deduplicação secundária por URL exata
  // ATENÇÃO: NÃO cortar por '?' para URLs do Drive (drive.google.com/thumbnail?id=XXX)
  // pois todas têm a mesma base URL — usar a URL completa como chave
  const seenUrls = new Set();
  const deduped = deduped1.filter((image) => {
    const url = image.fileUrl || '';
    if (!url) return false;
    // Para URLs do Drive com parâmetro id, usar a URL completa como chave
    const urlKey = url.includes('drive.google.com/thumbnail') || url.includes('lh3.googleusercontent.com')
      ? url.toLowerCase()
      : url.split('?')[0].toLowerCase();
    if (seenUrls.has(urlKey)) return false;
    seenUrls.add(urlKey);
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const result = { images: deduped, groups: buildGroups(deduped), total: deduped.length, sources: { Attachment: images.filter((i) => i.sourceEntity === 'Attachment').length, ReportPhoto: images.filter((i) => i.sourceEntity === 'ReportPhoto').length } };
  if (useCache) writeCache(cacheKey, result);
  return result;
}