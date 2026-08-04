import { base44 } from '@/api/base44Client';
import { dedupePhotosByTechnicalIdentity, getPhotoIdentity } from '@/utils/photoSimilarity';
import { deduplicateGalleryPhotos } from '@/utils/galleryDeduplication';
import { isInventedCaption, isTechnicalFileName } from '@/utils/galleryNormalization';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic'];
const DEFAULT_CACHE_KEY = 'museus_centro_galeria_fotos_cache_v19_three_sources';

// Limpar versões antigas do cache ao importar este módulo
try {
  ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'drive_fallback', 'v17_deduped_3layers'].forEach((suffix) => {
    const oldKeys = [
      `museus_centro_galeria_fotos_cache_${suffix}`,
      `museus_centro_galeria_fotos_cache_v6_${suffix}`,
    ];
    oldKeys.forEach((k) => localStorage.removeItem(k));
  });
} catch { /* noop */ }
const DEFAULT_TTL = 2 * 60 * 1000;
const DEFAULT_STALE_TTL = 24 * 60 * 60 * 1000;
const ENTITY_TIMEOUT_MS = 40000;

export const MUSEUM_SECTIONS = {
  MHAB: { key: 'MHAB', title: 'MHAB — Museu Histórico Abílio Barreto', shortTitle: 'MHAB', coordinates: '-19.936787, -43.947651' },
  MIS: { key: 'MIS', title: 'MIS — Museu da Imagem e do Som de Belo Horizonte', shortTitle: 'MIS', coordinates: '-19.927057, -43.940157' },
  MUMO: { key: 'MUMO', title: 'MUMO — Museu da Moda de Belo Horizonte', shortTitle: 'MUMO', coordinates: '-19.924875, -43.937250' },
  MAP: { key: 'MAP', title: 'MAP — Museu de Arte da Pampulha', shortTitle: 'MAP', coordinates: '-19.856, -43.966' },
  CasaKubitschek: { key: 'CasaKubitschek', title: 'Casa Kubitschek', shortTitle: 'Casa Kubitschek', coordinates: '-19.857, -43.968' },
  CasaDoBaile: { key: 'CasaDoBaile', title: 'Casa do Baíle', shortTitle: 'Casa do Baíle', coordinates: '-19.860, -43.967' },
  MuseuEscolaArquitetura: { key: 'MuseuEscolaArquitetura', title: 'Museu da Escola de Arquitetura', shortTitle: 'Museu da Escola de Arquitetura', coordinates: '-19.928, -43.938' },
  GaleriaArteUnimed: { key: 'GaleriaArteUnimed', title: 'Galeria de Arte Centro Cultural Unimed', shortTitle: 'Galeria de Arte Unimed', coordinates: '-19.920, -43.934' },
  CasaRosadaGasmig: { key: 'CasaRosadaGasmig', title: 'Casa Rosada Gasmig Minas', shortTitle: 'Casa Rosada Gasmig', coordinates: '-19.915, -43.930' },
  MemorialDireitosHumanos: { key: 'MemorialDireitosHumanos', title: 'Memorial dos Direitos Humanos', shortTitle: 'Memorial dos Direitos Humanos', coordinates: '-19.920, -43.940' },
  MemorialLegislativoMineiro: { key: 'MemorialLegislativoMineiro', title: 'Memorial do Legislativo Mineiro', shortTitle: 'Memorial do Legislativo Mineiro', coordinates: '-19.903, -43.956' },
  CentroMemoria: { key: 'CentroMemoria', title: 'Centro de Memória', shortTitle: 'Centro de Memória', coordinates: '-19.925, -43.935' },
  MuseuCabral: { key: 'MuseuCabral', title: 'Museu Cabral', shortTitle: 'Museu Cabral', coordinates: '-19.920, -43.935' },
  SEM_IDENTIFICACAO: { key: 'SEM_IDENTIFICACAO', title: 'Sem identificação de museu', shortTitle: 'Sem identificação', coordinates: '' },
};
export const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBaile', 'MuseuEscolaArquitetura', 'GaleriaArteUnimed', 'CasaRosadaGasmig', 'MemorialDireitosHumanos', 'MemorialLegislativoMineiro', 'CentroMemoria', 'MuseuCabral', 'SEM_IDENTIFICACAO'];

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
  const name = String(item.file_name || item.filename || item.name || '').trim();
  if (!name) return false;
  // Arquivos que começam com ._ (resource fork do Mac)
  if (name.startsWith('._')) return true;
  // Componentes de caminho com ._ (ex: "Museu ._Felipe_Vilaça.jpg")
  if (/\s\._|\._[^.]/.test(name)) return true;
  return false;
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
  if (!text) return '';
  // Ordem importa: Noturno antes de MIS/MAP pois pode conter ambos (ex: NoturnoNosMuseusMis)
  if (text.includes('noturno')) return 'Noturno';
  if (text.includes('mhab') || text.includes('abilio') || text.includes('barreto')) return 'MHAB';
  if (text.includes('mumo') || text.includes('moda')) return 'MUMO';
  if (text.includes('kubitschek')) return 'CasaKubitschek';
  if (text.includes('baile') || text.includes('baíle')) return 'CasaDoBaile';
  if (text.includes('memorial') && text.includes('legislativo')) return 'MemorialLegislativoMineiro';
  if (text.includes('memorial') && text.includes('direitos')) return 'MemorialDireitosHumanos';
  if (text.includes('escola') && text.includes('arquitetura')) return 'MuseuEscolaArquitetura';
  if (text.includes('unimed')) return 'GaleriaArteUnimed';
  if (text.includes('rosada') || text.includes('gasmig')) return 'CasaRosadaGasmig';
  if (text.includes('centro') && text.includes('memoria')) return 'CentroMemoria';
  if (text.includes('cabral')) return 'MuseuCabral';
  // MIS: 'mis' como palavra isolada, no início (ex: Mis14072026) ou por nome completo
  if (text === 'mis' || text.startsWith('mis') || text.includes('imagem e do som') || text.includes('imagem e som') || text.includes('museu da imagem')) return 'MIS';
  if (text.includes('arte da pampulha') || (text.includes('pampulha') && (text.includes('arte') || text.includes('map')))) return 'MAP';
  if (text.includes('pampulha')) return 'MAP';
  // Fallback: se há um nome de museu não vazio mas não reconhecido, usa-o como chave normalizada
  // para que fotos da mesma pasta apareçam agrupadas corretamente na galeria
  // Mas só para nomes curtos e legíveis — nomes técnicos longos (CamelCase sem espaços) são ignorados
  if (text.length >= 3 && text.length <= 40 && !/[a-z][A-Z]/.test(text) && /\s/.test(text)) {
    const slug = text
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    if (slug.length >= 3 && slug.length <= 40) return slug;
  }
  return '';
}
function resolveSectionKey(item = {}, metadataLocation = '') {
  // Prioriza item.museu e item.centro_custo — campos canônicos de museu/centro de custo
  const primaryValues = [item.museu, item.centro_custo];
  for (const value of primaryValues) {
    const found = normalizeMuseum(value);
    if (found) return found;
  }
  // Fallback para outros campos que podem conter o nome do museu
  // NÃO usa file_name — nomes técnicos de arquivo geram seções falsas
  const values = [item.local, item.localizacao, item.descricao, item.description, item.legenda, item.caption, metadataLocation];
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

  // Priorizar thumbnails do Drive (menores e mais rápidos) quando driveFileId está disponível
  if (driveFileId) {
    candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w400`);
    candidates.push(`https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=w400`);
  }
  if (thumbnail) candidates.push(thumbnail);
  if (rawUrl && !isDrivePageUrl(rawUrl)) candidates.push(rawUrl);
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
  const knownSection = MUSEUM_SECTIONS[sectionKey];
  // Se a seção não for conhecida mas tiver um nome válido, cria uma entrada dinâmica
  const section = knownSection || {
    key: sectionKey,
    title: item.museu || sectionKey,
    shortTitle: item.museu || sectionKey,
    coordinates: '',
  };
  const driveContext = parseDriveContext(item);
  const timestamp = normalizeDate(firstValue(item, ['data_foto', 'photo_date', 'taken_at', 'captured_at', 'date_taken']) || driveContext.data_foto || item.created_at || item.created_date || item.updated_date);
  const source = resolvePhotoSource(item);
  const fileName = item.file_name || item.filename || item.name || 'imagem';
  const activityTitulo = item.atividade_titulo || item.activity_title || driveContext.atividade_nome || '';
  // Legenda construída APENAS com metadados estruturados reais: atividade → local → período.
  // Não usa campos de texto livre (caption/legenda) que podem conter descrição inventada pela IA.
  const localReal = String(metadataLocation || item.atividade_local || item.local || '').trim();
  const periodoCtx = item.mes_referencia ? `${item.mes_referencia}${item.ano ? `/${item.ano}` : ''}` : '';
  const legendaFinal = [activityTitulo, localReal, periodoCtx].filter(Boolean).join(' — ');
  const mapped = {
    id: `${sourceEntity.toLowerCase()}-${item.id || source.driveFileId || fileName || timestamp}`,
    sourceId: item.id || source.driveFileId || fileName || '',
    sourceEntity,
    fileUrl: source.fileUrl,
    fallbackUrls: source.fallbackUrls,
    originalFileUrl: source.originalFileUrl,
    legacyDriveUrl: source.legacyDriveUrl,
    fileName,
    legenda: legendaFinal,
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
    activityTitulo,
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
  const buckets = new Map();
  images.forEach((image) => {
    const key = image.sectionKey || 'SEM_IDENTIFICACAO';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(image);
  });
  // Ordena: seções conhecidas primeiro (na ordem de SECTION_ORDER), depois as desconhecidas alfabeticamente
  const known = SECTION_ORDER.filter((key) => buckets.has(key)).map((key) => ({ key, sectionTitle: MUSEUM_SECTIONS[key].title, shortTitle: MUSEUM_SECTIONS[key].shortTitle, coordinates: MUSEUM_SECTIONS[key].coordinates || '', images: buckets.get(key) || [] }));
  const unknown = Object.keys(MUSEUM_SECTIONS).includes
    ? Array.from(buckets.keys())
        .filter((key) => !MUSEUM_SECTIONS[key])
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
        .map((key) => ({ key, sectionTitle: key, shortTitle: key, coordinates: '', images: buckets.get(key) || [] }))
    : [];
  return [...known, ...unknown].filter((group) => group.images.length);
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

// Busca registros paginando de PAGE_SIZE em PAGE_SIZE, com limite máximo para evitar travamento
const PAGE_SIZE = 200;
const MAX_PAGES = 10; // máx 2000 registros por entidade
async function fetchAllPages(entityName, order, { quietMissing = false } = {}) {
  const entity = base44?.entities?.[entityName];
  if (!entity?.filter) {
    return safeEntityList(entityName, order, 2000, { quietMissing });
  }
  const all = [];
  let skip = 0;
  let hasMore = true;
  let pageCount = 0;
  while (hasMore && pageCount < MAX_PAGES) {
    try {
      const page = await withTimeout(
        entity.filter({}, order, PAGE_SIZE, skip),
        `${entityName} p${pageCount + 1}`,
        20000
      );
      const items = Array.isArray(page) ? page : [];
      all.push(...items);
      if (items.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        skip += PAGE_SIZE;
        pageCount++;
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
  skipDedup = false,
} = {}) {
  void limitMedia;
  void limitAttachments; // ignorado — sempre busca tudo via paginação
  if (useCache) {
    const cached = readCache(cacheKey, cacheTtlMs);
    if (cached) return { ...cached, cacheUsed: true };
  }
  const staleCache = useCache ? readCache(cacheKey, cacheTtlMs, { allowStale: true, staleTtlMs: staleCacheTtlMs }) : null;
  const images = [];

  // ── Fase 1: Fontes primárias (Report + Activity + ReportPhoto) ──
  const [reports, activities, reportPhotos] = await Promise.all([
    fetchAllPages('Report', '-updated_date', { quietMissing: true }).catch((e) => { console.warn('[Galeria] Report falhou:', e?.message); return []; }),
    fetchAllPages('Activity', '-updated_date', { quietMissing: true }).catch((e) => { console.warn('[Galeria] Activity falhou:', e?.message); return []; }),
    fetchAllPages('ReportPhoto', '-created_date', { quietMissing: true }).catch((e) => { console.warn('[Galeria] ReportPhoto falhou:', e?.message); return []; }),
  ]);

  // Mapa de contexto (museu/período/autor) por report_id para enriquecer fotos de atividades
  const reportCtxMap = new Map();
  reports.forEach((r) => {
    if (r.id) reportCtxMap.set(r.id, { museu: r.museu || '', mes_referencia: r.mes_referencia || '', ano: r.ano || r.ano_referencia || '', author_name: r.author_name || '' });
  });

  // Título da atividade por id, para dar legenda real às fotos de ReportPhoto
  const activityTituloById = new Map();
  activities.forEach((a) => { if (a.id && a.titulo) activityTituloById.set(a.id, a.titulo); });

  // Controle de deduplicação por file_url entre todas as fontes
  const seenUrlsInit = new Set();

  // Fotos embutidas em Report.fotos[] e Report.atividades[].fotos[]
  reports.forEach((report) => {
    const ctx = reportCtxMap.get(report.id) || {};
    if (Array.isArray(report.fotos)) {
      report.fotos.forEach((foto, idx) => {
        if (!foto?.file_url || !/^https?:/i.test(foto.file_url) || isMacResourceFork(foto)) return;
        if (seenUrlsInit.has(foto.file_url)) return;
        seenUrlsInit.add(foto.file_url);
        images.push(mapPhoto({ ...foto, ...ctx, author: foto.autor || ctx.author_name || '', id: `${report.id || 'r'}_f${idx}` }, 'Report'));
      });
    }
    if (Array.isArray(report.atividades)) {
      report.atividades.forEach((atividade, aIdx) => {
        if (!Array.isArray(atividade?.fotos)) return;
        atividade.fotos.forEach((foto, idx) => {
          if (!foto?.file_url || !/^https?:/i.test(foto.file_url) || isMacResourceFork(foto)) return;
          if (seenUrlsInit.has(foto.file_url)) return;
          seenUrlsInit.add(foto.file_url);
          images.push(mapPhoto({ ...foto, ...ctx, author: foto.autor || ctx.author_name || '', atividade_titulo: atividade.titulo || '', id: `${report.id || 'r'}_a${aIdx}_${idx}` }, 'Report'));
        });
      });
    }
  });

  // Ampliar o set de deduplicação com URLs já mapeadas
  const seenUrls = seenUrlsInit;

  // Fotos da entidade ReportPhoto (vinculadas a relatórios)
  reportPhotos.forEach((rp) => {
    if (!rp?.file_url || !/^https?:/i.test(rp.file_url) || isMacResourceFork(rp)) return;
    if (rp.galeria_oculta) return;
    if (seenUrls.has(rp.file_url)) return;
    seenUrls.add(rp.file_url);
    const ctx = reportCtxMap.get(rp.report_id) || {};
    images.push(mapPhoto({
      ...rp,
      museu: rp.museu || ctx.museu || '',
      mes_referencia: rp.mes_referencia || ctx.mes_referencia || '',
      ano: rp.ano || ctx.ano || '',
      author: rp.author || ctx.author_name || '',
      atividade_titulo: activityTituloById.get(rp.activity_id) || '',
      id: rp.id,
    }, 'ReportPhoto'));
  });

  // Fotos embutidas em Activity.fotos[]
  activities.forEach((activity) => {
    const ctx = reportCtxMap.get(activity.report_id) || {};
    if (!Array.isArray(activity.fotos)) return;
    activity.fotos.forEach((foto, idx) => {
      if (!foto?.file_url || !/^https?:/i.test(foto.file_url) || isMacResourceFork(foto)) return;
      if (seenUrls.has(foto.file_url)) return;
      seenUrls.add(foto.file_url);
      images.push(mapPhoto({ ...foto, ...ctx, author: foto.autor || ctx.author_name || '', atividade_titulo: activity.titulo || '', id: `${activity.id || 'a'}_f${idx}` }, 'Activity'));
    });
  });

  // Se nenhuma imagem foi carregada, usa cache antigo como fallback
  if (!images.length && staleCache) return { ...staleCache, cacheUsed: true, cacheStale: true };
  let deduped, duplicates, totalBruto, totalDeduped, totalOcultadas;
  if (skipDedup) {
    // Sem deduplicação — exibe 100% das fotos
    deduped = images.filter((image) => image.fileUrl).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    duplicates = [];
    totalBruto = deduped.length;
    totalDeduped = deduped.length;
    totalOcultadas = 0;
  } else {
    // Deduplicação primária por identidade técnica (URL/driveFileId/galleryFileName)
    const deduped1 = dedupePhotosByTechnicalIdentity(images).filter((image) => image.fileUrl);
    // Deduplicação em 3 camadas: URL idêntica > nome de arquivo idêntico por museu > nome similar (cópia/versão)
    const result = deduplicateGalleryPhotos(deduped1);
    deduped = result.deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    duplicates = result.duplicates;
    totalBruto = result.totalBruto;
    totalDeduped = result.totalDeduped;
    totalOcultadas = result.totalOcultadas;
  }
  const result = {
    images: deduped,
    groups: buildGroups(deduped),
    total: deduped.length,
    totalBruto,
    totalDeduped,
    totalOcultadas,
    duplicates,
    sources: {
      Report: images.filter((i) => i.sourceEntity === 'Report').length,
      Activity: images.filter((i) => i.sourceEntity === 'Activity').length,
      ReportPhoto: images.filter((i) => i.sourceEntity === 'ReportPhoto').length,
    },
  };
  // Só grava cache se houver ao menos 1 imagem, para não sobrescrever cache bom com resultado vazio
  if (useCache && images.length > 0) writeCache(cacheKey, result);
  return result;
}