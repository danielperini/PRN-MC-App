import { base44 } from '@/api/base44Client';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';
import { revisarHtmlRelatorioAntesDaExportacao } from '@/services/reportEditorialReview';
import { consolidateOfficialDashboardMetrics } from '@/utils/auditoria/institutionalMetrics';
import {
  DEFAULT_OPTIONS as REPORT_IMAGE_OPTIMIZATION_OPTIONS,
  optimizeReportHtmlImages,
} from '@/utils/reportImageOptimizer';
import {
  REPORT_CHAPTERS,
  REPORT_CHAPTER_IDS,
  getReportChapterById,
  normalizeSelectedReportChapterIds,
} from '@/config/reportChapters';

export const EXPORT_VOLUME_COUNT = 3;
export const EXPORT_FILENAME_BASE = 'Museus-Centro-Relatorio';
export const SINGLE_REPORT_FILENAME = 'Museus-Centro-Relatorio-Fisico-Financeiro.pdf';
export const DATA_REPORT_FILENAME = 'Museus-Centro-Relatorio-Dados.pdf';
export const GALLERY_REPORT_FILENAME = 'Museus-Centro-Relatorio-Galeria.pdf';
export const SINGLE_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_html';
export const SINGLE_REPORT_META_KEY = 'relatorio_fisico_financeiro_meta';
export const DATA_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_dados_html';
export const DATA_REPORT_META_KEY = 'relatorio_fisico_financeiro_dados_meta';
export const GALLERY_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_galeria_html';
export const GALLERY_REPORT_META_KEY = 'relatorio_fisico_financeiro_galeria_meta';
export const PREVIEW_DB_NAME = 'museus_centro_report_preview';
export const PREVIEW_DB_STORE = 'previews';

export const REPORT_PREVIEW_VARIANTS = {
  single: {
    htmlKey: SINGLE_REPORT_HTML_KEY,
    metaKey: SINGLE_REPORT_META_KEY,
    filename: SINGLE_REPORT_FILENAME,
    title: 'Museus Centro - Relatório Físico-Financeiro',
    exportMode: 'single_pdf',
  },
  dados: {
    htmlKey: DATA_REPORT_HTML_KEY,
    metaKey: DATA_REPORT_META_KEY,
    filename: DATA_REPORT_FILENAME,
    title: 'Museus Centro - Relatório de Dados',
    exportMode: 'data_pdf',
  },
  galeria: {
    htmlKey: GALLERY_REPORT_HTML_KEY,
    metaKey: GALLERY_REPORT_META_KEY,
    filename: GALLERY_REPORT_FILENAME,
    title: 'Museus Centro - Relatório Galeria',
    exportMode: 'gallery_pdf',
  },
};

const ENCODING_REPAIRS = [
  ['IntroduÃ§Ã£o', 'Introdução'],
  ['ComunicaÃ§Ã£o', 'Comunicação'],
  ['programaÃ§Ã£o', 'programação'],
  ['ProgramaÃ§Ã£o', 'Programação'],
  ['execuÃ§Ã£o', 'execução'],
  ['ExecuÃ§Ã£o', 'Execução'],
  ['pÃºblico', 'público'],
  ['PÃºblico', 'Público'],
  ['orÃ§amento', 'orçamento'],
  ['OrÃ§amento', 'Orçamento'],
  ['informaÃ§Ãµes', 'informações'],
  ['InformaÃ§Ãµes', 'Informações'],
  ['evidÃªncias', 'evidências'],
  ['EvidÃªncias', 'Evidências'],
  ['relatÃ³rio', 'relatório'],
  ['RelatÃ³rio', 'Relatório'],
  ['capÃ­tulo', 'capítulo'],
  ['capÃ­tulos', 'capítulos'],
  ['perÃ­odo', 'período'],
  ['PerÃ­odo', 'Período'],
  ['sÃ­ntese', 'síntese'],
  ['SÃ­ntese', 'Síntese'],
  ['memÃ³ria', 'memória'],
  ['MemÃ³ria', 'Memória'],
  ['governanÃ§a', 'governança'],
  ['GovernanÃ§a', 'Governança'],
  ['prestaÃ§Ã£o', 'prestação'],
  ['PrestaÃ§Ã£o', 'Prestação'],
  ['Pagina', 'Página'],
  ['pagina', 'página'],
  ['vÃ­nculos', 'vínculos'],
  ['vÃ­nculo', 'vínculo'],
  ['nÃ£o', 'não'],
  ['Ã©', 'é'],
  ['Ã¡', 'á'],
  ['Ãª', 'ê'],
  ['Ã­', 'í'],
  ['Ã³', 'ó'],
  ['Ãº', 'ú'],
  ['Ã§', 'ç'],
  ['Ã£', 'ã'],
  ['Ãµ', 'õ'],
  ['Â·', '·'],
  ['Âº', 'º'],
  ['â€”', '—'],
  ['â€“', '–'],
  ['â€œ', '"'],
  ['â€�', '"'],
  ['â€˜', "'"],
  ['â€™', "'"],
];

export function repairReportEncoding(html = '') {
  let output = String(html || '');
  ENCODING_REPAIRS.forEach(([broken, fixed]) => {
    output = output.split(broken).join(fixed);
  });
  return output;
}

const OPENING_CHAPTER_IDS = ['capa', 'expediente', 'sumario_executivo', 'introducao'];
const CHAPTER_MUSEUM_WEIGHT = {
  agenda_programacao: 1.7,
  atividades_museu: 2.2,
  museus_premium: 1.8,
  relatorios_completos: 1.6,
  comunicacao: 1.3,
  comunicacao_premium: 1.2,
  financeiro: 1.5,
  rubricas: 1.4,
  orcamento_museu: 1.4,
  prestacao: 1.5,
  'notas-fiscais-contratos': 1.8,
  governanca_documental: 1.2,
};

export function getVolumeHtmlKey(volumeNumber) {
  return `relatorio_fisico_financeiro_volume_${Number(volumeNumber) || 1}_html`;
}

export function getVolumeMetaKey(volumeNumber) {
  return `relatorio_fisico_financeiro_volume_${Number(volumeNumber) || 1}_meta`;
}

export function buildPartFileName(partNumber, extension = 'html') {
  return `${EXPORT_FILENAME_BASE}-Volume-${Number(partNumber) || 1}.${extension}`;
}

export function getCapituloLabel(sectionId) {
  return getReportChapterById(sectionId)?.title || sectionId;
}

const reportDataCache = new Map();

export function clearReportDataCache() {
  reportDataCache.clear();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return String(error?.message || error || '');
}

function isRateLimitError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('rate limit') || message.includes('429');
}

function isEntityNotFoundError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('entity schema') || message.includes('not found in app');
}

async function withRetry(fn, { retries = 3, baseDelay = 900 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === retries) throw error;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }

  throw lastError;
}

async function safeList(entity, order = '-created_date', limit = 1000, { cacheKey = '', required = false } = {}) {
  if (!entity?.list) {
    if (required) throw new Error(`Entidade obrigatoria indisponivel: ${cacheKey || 'desconhecida'}`);
    return [];
  }

  const key = cacheKey || `${entity?.name || 'entity'}:${order}:${limit}`;
  if (reportDataCache.has(key)) return reportDataCache.get(key);

  try {
    const res = await withRetry(() => entity.list(order, limit));
    const data = Array.isArray(res) ? res : [];
    reportDataCache.set(key, data);
    return data;
  } catch (error) {
    if (isEntityNotFoundError(error)) {
      console.warn(`Entidade opcional ausente no relatorio (${key}):`, error);
      reportDataCache.set(key, []);
      return [];
    }
    if (required) {
      throw new Error(`Falha ao carregar entidade obrigatoria ${key}: ${errorMessage(error)}`);
    }
    console.warn(`Falha ao listar entidade opcional do relatorio (${key}):`, error);
    reportDataCache.set(key, []);
    return [];
  }
}

async function loadReportEntitiesSafely() {
  const loaders = [
    ['reportsRaw', () => safeList(base44.entities.Report, '-updated_date', 2000, { cacheKey: 'Report', required: true })],
    ['rubricasRaw', () => safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000, { cacheKey: 'Rubrica', required: true })],
    ['comprasRaw', () => safeList(base44.entities.PurchaseRequest, '-created_date', 2000, { cacheKey: 'PurchaseRequest' })],
    ['teamPaymentsRaw', () => safeList(base44.entities.TeamPayment, '-created_date', 2000, { cacheKey: 'TeamPayment' })],
    ['documentIntakeRaw', () => safeList(base44.entities.DocumentIntake, '-created_date', 2000, { cacheKey: 'DocumentIntake' })],
    ['attachmentsRaw', () => safeList(base44.entities.Attachment, '-created_date', 3000, { cacheKey: 'Attachment' })],
    ['metasRaw', () => safeList(base44.entities.Meta, 'codigo', 1000, { cacheKey: 'Meta' })],
    ['programacaoRaw', () => safeList(base44.entities.Programacao, '-data_inicio', 3000, { cacheKey: 'Programacao' })],
    ['conhecimentoRaw', () => carregarBaseConhecimento()],
  ];
  const data = {};
  const errors = [];

  for (const [key, loader] of loaders) {
    try {
      data[key] = await loader();
    } catch (error) {
      errors.push({ entity: key, message: errorMessage(error) });
      throw error;
    }
    await sleep(260);
  }

  return { data, errors };
}

async function carregarBaseConhecimento() {
  const candidatos = [
    base44?.entities?.BaseConhecimento,
    base44?.entities?.KnowledgeBase,
    base44?.entities?.KnowledgeItem,
    base44?.entities?.ProjectKnowledge,
  ].filter(Boolean);

  for (const entity of candidatos) {
    const lista = await safeList(entity, '-updated_date', 500, { cacheKey: `Knowledge:${entity?.name || candidatos.indexOf(entity)}` });
    if (lista.length > 0) return lista;
  }

  return [];
}

export async function buildReportDataContext({
  museu = 'Todos',
  secoesSelecionadas = REPORT_CHAPTER_IDS,
  splitContext = null,
  selectedInlinePhotoIds = [],
} = {}) {
  const dateFrom = '2026-02-02';
  const dateTo = '2026-04-30';
  const museuFiltro = museu === 'Todos' ? 'todos' : museu;
  const normalizedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);

  const {
    data: {
      reportsRaw = [],
      rubricasRaw = [],
      comprasRaw = [],
      teamPaymentsRaw = [],
      documentIntakeRaw = [],
      attachmentsRaw = [],
      metasRaw = [],
      programacaoRaw = [],
      conhecimentoRaw = [],
    },
    errors: loadErrors = [],
  } = await loadReportEntitiesSafely();
  const galleryRaw = [];
  const presenceRecordsRaw = [];

  const dashboardMetrics = consolidateOfficialDashboardMetrics({
    reports: reportsRaw,
    programacao: programacaoRaw,
    rubricas: rubricasRaw,
    metas: metasRaw,
    photos: [...attachmentsRaw, ...galleryRaw],
    presenceRecords: presenceRecordsRaw,
  }, {
    period: { from: dateFrom, to: dateTo },
  });

  const contexto = buildRelatorioFisicoFinanceiroContext({
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    teamPaymentsRaw,
    documentIntakeRaw,
    attachmentsRaw,
    galleryRaw,
    metasRaw,
    presenceRecordsRaw,
    programacaoRaw,
    conhecimentoRaw,
    filtros: {
      dateFrom,
      dateTo,
      museu: museuFiltro,
      capitulos: normalizedSections,
      split_context: splitContext || undefined,
    },
  });

  return {
    contexto: {
      ...contexto,
      dashboard_metrics: dashboardMetrics,
      dashboard_data_source: {
        reports: reportsRaw.length,
        programacao: programacaoRaw.length,
        rubricas: rubricasRaw.length,
        metas: metasRaw.length,
        attachments: attachmentsRaw.length,
        gallery: 0,
        presenceRecords: 0,
      },
      data_load_alerts: loadErrors,
      capitulos_relatorio: REPORT_CHAPTERS,
      secoesSelecionadas: normalizedSections,
      split_context: splitContext || undefined,
      selected_inline_photo_ids: selectedInlinePhotoIds,
    },
    filtros: {
      dateFrom,
      dateTo,
      museu: museu === 'Todos' ? 'Todos os museus' : museu,
    },
  };
}

function estimateChapterWeight(sectionId, context = {}) {
  const base = CHAPTER_MUSEUM_WEIGHT[sectionId] || 1;
  const activities = Array.isArray(context?.atividades) ? context.atividades.length : 0;
  const photos = Array.isArray(context?.fotos) ? context.fotos.length : 0;
  const docs = Array.isArray(context?.attachments_raw) ? context.attachments_raw.length : 0;
  const multiplier = 1 + (activities / 600) + (photos / 1200) + (docs / 1800);
  return Number((base * multiplier).toFixed(3));
}

function chapterHasRenderableContent(sectionId, context = {}) {
  const atividades = Array.isArray(context?.atividades) ? context.atividades : [];
  const fotos = Array.isArray(context?.fotos) ? context.fotos : [];
  const rubricas = Array.isArray(context?.rubricas) ? context.rubricas : [];
  const compras = Array.isArray(context?.compras) ? context.compras : [];
  const relatorios = Array.isArray(context?.relatorios_equipe) ? context.relatorios_equipe : [];
  const programacao = Array.isArray(context?.programacao) ? context.programacao : [];
  const documentos = Array.isArray(context?.attachments_raw) ? context.attachments_raw : [];

  if (OPENING_CHAPTER_IDS.includes(sectionId)) return true;

  switch (sectionId) {
    case 'atividades_museu':
    case 'museus_premium':
      return atividades.length > 0;
    case 'comunicacao':
    case 'comunicacao_premium':
      return atividades.length > 0 || fotos.length > 0;
    case 'programacao':
    case 'agenda_programacao':
    case 'timeline_premium':
      return programacao.length > 0 || atividades.length > 0;
    case 'relatorios_completos':
      return relatorios.length > 0;
    case 'financeiro':
    case 'rubricas':
    case 'orcamento_museu':
      return rubricas.length > 0 || compras.length > 0;
    case 'prestacao':
    case 'notas-fiscais-contratos':
    case 'governanca_documental':
      return documentos.length > 0 || compras.length > 0;
    case 'galeria_evidencias':
    case 'galeria_premium':
      return fotos.length > 0;
    default:
      return true;
  }
}

export function buildEditorialVolumePlan(sectionIds = [], context = {}) {
  const selected = normalizeSelectedReportChapterIds(sectionIds);
  const usedSections = new Set();
  const baseParts = Array.from({ length: EXPORT_VOLUME_COUNT }, (_, index) => ({
    partNumber: index + 1,
    totalParts: EXPORT_VOLUME_COUNT,
    secoes: [],
    sectionPlan: [],
    estimatedWeight: 0,
    estimatedPages: 0,
    estimatedMB: 0,
    estimatedImages: 0,
    status: 'adequado',
  }));

  selected.forEach((sectionId) => {
    if (usedSections.has(sectionId)) return;
    if (!chapterHasRenderableContent(sectionId, context)) return;

    const onlyVolume1 = OPENING_CHAPTER_IDS.includes(sectionId);
    const explicitVolume = onlyVolume1
      ? 1
      : sectionId === 'financeiro' || sectionId === 'rubricas' || sectionId === 'prestacao' || sectionId === 'governanca_documental' || sectionId === 'metas' || sectionId === 'notas-fiscais-contratos'
        ? 2
        : sectionId === 'app_museu_centro' || sectionId === 'sistema_governanca' || sectionId === 'relatorios_completos' || sectionId === 'agenda_programacao' || sectionId === 'galeria_premium' || sectionId === 'galeria_evidencias' || sectionId === 'conclusao'
          ? 3
          : 1;

    const part = baseParts[explicitVolume - 1];
    const item = {
      id: sectionId,
      title: getCapituloLabel(sectionId),
      weight: estimateChapterWeight(sectionId, context),
      onlyVolume1,
    };
    part.secoes.push(sectionId);
    part.sectionPlan.push(item);
    part.estimatedWeight += item.weight;
    usedSections.add(sectionId);
  });

  baseParts.forEach((part) => {
    if (part.secoes.length === 0) {
      part.status = 'sem conteudo';
      return;
    }
    part.estimatedPages = Math.max(2, Math.round(part.estimatedWeight * 3.4));
    part.estimatedImages = Math.max(0, Math.round(part.estimatedWeight * 4));
    part.estimatedMB = Number(Math.max(0.8, part.estimatedWeight * 2.1).toFixed(1));
    if (part.estimatedMB > 180) part.status = 'volume pesado para revisar';
  });

  return baseParts;
}

export function buildVolumeMeta(part, { pageNumberOffset = 0 } = {}) {
  const chapterIds = Array.isArray(part?.secoes) ? part.secoes : [];
  return {
    volumeNumber: Number(part?.partNumber) || 1,
    totalVolumes: EXPORT_VOLUME_COUNT,
    pageNumberOffset: Number(pageNumberOffset) || 0,
    estimatedPages: Number(part?.estimatedPages) || 0,
    estimatedMB: Number(part?.estimatedMB) || 0,
    chapterIds,
    chapterLabels: chapterIds.map(getCapituloLabel),
    generatedAt: new Date().toISOString(),
  };
}

function elementHasUsefulContent(element) {
  if (!element) return false;
  const clone = element.cloneNode(true);
  clone.querySelectorAll('.report-pdf-institutional-header, script, style, noscript').forEach((node) => node.remove());
  const text = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
  const visualCount = clone.querySelectorAll?.('img, table, canvas, svg, figure, article, .premium-metric, .premium-infographic-card').length || 0;
  return text.length > 18 || visualCount > 0;
}

export function cleanEmptyReportSections(html = '') {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(repairReportEncoding(String(html)), 'text/html');

    doc.querySelector('meta[charset]')?.setAttribute('charset', 'UTF-8');

    doc.querySelectorAll('.empty-section, section, article').forEach((node) => {
      if (node.classList?.contains('premium-cover')) return;
      if (!elementHasUsefulContent(node)) node.remove();
    });

    doc.querySelectorAll('.premium-page-break').forEach((node) => {
      if (!elementHasUsefulContent(node)) node.classList.remove('premium-page-break');
    });

    doc.querySelectorAll('div').forEach((node) => {
      const className = String(node.getAttribute('class') || '');
      if (!/page|section|container|wrapper|premium/i.test(className)) return;
      if (!elementHasUsefulContent(node)) node.remove();
    });

    doc.querySelectorAll('.premium-page-break').forEach((node) => {
      const previous = node.previousElementSibling;
      if (previous?.classList?.contains('premium-page-break') && !elementHasUsefulContent(previous)) {
        previous.remove();
      }
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('Falha ao limpar secoes vazias do relatorio:', error);
    return html;
  }
}

function stripGalleryImagesFromDataReport(html = '') {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html), 'text/html');

    doc.querySelectorAll('.premium-internal-page-header, .premium-cover-grid').forEach((node) => node.remove());

    doc.querySelectorAll(
      '.premium-activity-photo-strip, .premium-activity-photos, .premium-photo-index, .premium-photo, .premium-gallery, .premium-attachment-thumb'
    ).forEach((node) => node.remove());

    doc.querySelectorAll('img').forEach((node) => {
      const src = String(node.getAttribute('src') || '');
      if (src.includes('viaduto-logo')) return;
      if (node.closest('.premium-cover')) return;
      node.remove();
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('Falha ao remover imagens fotograficas do relatorio principal:', error);
    return html;
  }
}

export async function buildVolumeHtml({
  museu = 'Todos',
  premium = true,
  secoesSelecionadas = REPORT_CHAPTER_IDS,
  splitContext = null,
  selectedInlinePhotoIds = [],
} = {}) {
  const { contexto, filtros } = await buildReportDataContext({
    museu,
    secoesSelecionadas,
    splitContext,
    selectedInlinePhotoIds,
  });

  const textos = await gerarTextosRelatorioFisicoFinanceiro(contexto, true);
  const htmlInicial = premium ? montarHtmlRelatorioPremium({
    contexto,
    textos,
    filtros,
    secoesSelecionadas,
  }) : montarHtmlRelatorioFisicoFinanceiro({
    contexto,
    textos,
    secoesSelecionadas,
    filtros,
  });
  const htmlRevisado = revisarHtmlRelatorioAntesDaExportacao(htmlInicial, { modo: premium ? 'premium' : 'fisico_financeiro' });
  const htmlOtimizado = await optimizeReportHtmlImages(htmlRevisado, REPORT_IMAGE_OPTIMIZATION_OPTIONS);
  const html = cleanEmptyReportSections(repairReportEncoding(htmlOtimizado));

  return { html, contexto, filtros };
}

function countHtmlImages(html = '') {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return 0;
  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    return doc.querySelectorAll('img[src]').length;
  } catch {
    return 0;
  }
}

function estimateHtmlPages(html = '') {
  if (!String(html || '').trim()) return 0;
  const textLength = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const imageCount = countHtmlImages(html);
  return Math.max(1, Math.ceil((textLength / 3400) + (imageCount * 0.35)));
}

function estimateHtmlSizeMB(html = '') {
  return Number((new Blob([String(html || '')], { type: 'text/html;charset=utf-8' }).size / (1024 * 1024)).toFixed(2));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPhotoUrl(photo = {}) {
  return photo?.url || photo?.file_url || photo?.fileUrl || photo?.src || photo?.link || photo?.arquivo_url || photo?.arquivo_original_url || photo?.imagem_url || '';
}

function getPhotoIdentityKey(photo = {}) {
  const url = getPhotoUrl(photo);
  return String(
    photo?.id ||
    photo?.attachment_id ||
    photo?.attachmentId ||
    photo?.sourceId ||
    photo?.file_id ||
    url
  ).split('?')[0].split('#')[0];
}

function isLikelyImage(photo = {}) {
  const url = getPhotoUrl(photo);
  const name = `${url} ${photo?.fileName || ''} ${photo?.file_name || ''} ${photo?.name || ''} ${photo?.mime_type || ''} ${photo?.type || ''}`.toLowerCase();
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url) ||
    name.includes('image/') ||
    name.includes('foto') ||
    name.includes('imagem') ||
    name.includes('gallery');
}

function normalizeGalleryLabel(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function buildGalleryGroups(contexto = {}) {
  const allPhotos = [
    ...(Array.isArray(contexto?.fotos) ? contexto.fotos : []),
    ...(Array.isArray(contexto?.attachments_raw) ? contexto.attachments_raw : []),
  ];
  const used = new Set();
  const groups = new Map();

  allPhotos.forEach((photo) => {
    const url = getPhotoUrl(photo);
    const key = getPhotoIdentityKey(photo);
    if (!url || !key || used.has(key) || !isLikelyImage(photo)) return;
    used.add(key);

    const museu = normalizeGalleryLabel(photo?.museu || photo?.museum || photo?.equipamento, 'Museus Centro');
    const mes = normalizeGalleryLabel(photo?.mes || photo?.month || String(photo?.data || photo?.created_date || '').slice(0, 10), 'Periodo sem data');
    const atividade = normalizeGalleryLabel(
      photo?.atividade ||
      photo?.atividade_nome ||
      photo?.titulo_atividade ||
      photo?.activity_title ||
      photo?.titulo ||
      photo?.legenda ||
      photo?.caption,
      'Fotos sem atividade vinculada'
    );
    const groupKey = `${museu}||${mes}||${atividade}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { museu, mes, atividade, photos: [] });
    }

    groups.get(groupKey).photos.push({
      ...photo,
      url,
      fileName: normalizeGalleryLabel(photo?.fileName || photo?.file_name || photo?.name || url.split('/').pop(), 'Registro fotografico'),
      credit: normalizeGalleryLabel(photo?.credito || photo?.creditos || photo?.credit || photo?.fotografo || photo?.author_name, 'Credito nao informado'),
      location: normalizeGalleryLabel(photo?.localizacao?.label || photo?.location?.label || photo?.local || photo?.endereco, 'Localizacao nao informada'),
    });
  });

  return Array.from(groups.values()).sort((a, b) =>
    `${a.museu} ${a.mes} ${a.atividade}`.localeCompare(`${b.museu} ${b.mes} ${b.atividade}`)
  );
}

function buildGalleryIntroHtml({ totalPhotos = 0, groups = [], selectedChapters = [] } = {}) {
  const totalChapters = selectedChapters.length || REPORT_CHAPTER_IDS.length;

  return `
        <h2>Relat\u00f3rio Galeria \u2014 evid\u00eancias visuais, atividades e geolocaliza\u00e7\u00e3o</h2>
        <p class="intro-lead">Este Relat\u00f3rio Galeria organiza as imagens registradas no \u00e2mbito do Projeto Museus Centro como evid\u00eancias visuais das atividades realizadas no per\u00edodo de 2 de fevereiro a 30 de abril de 2026. As fotografias n\u00e3o s\u00e3o tratadas como uma galeria gen\u00e9rica ou meramente ilustrativa, mas como documentos vinculados \u00e0s a\u00e7\u00f5es registradas pela equipe, preservando a rela\u00e7\u00e3o entre imagem, atividade, museu, data, relat\u00f3rio de origem e, quando dispon\u00edvel, geolocaliza\u00e7\u00e3o.</p>
        <p>A organiza\u00e7\u00e3o das imagens parte do princ\u00edpio de que cada registro fotogr\u00e1fico comprova, qualifica ou contextualiza uma atividade espec\u00edfica. Assim, as imagens s\u00e3o agrupadas a partir do v\u00ednculo original informado nos relat\u00f3rios da equipe e associadas aos respectivos equipamentos culturais \u2014 Museu Hist\u00f3rico Ab\u00edlio Barreto, Museu da Imagem e do Som, Museu da Moda ou a\u00e7\u00f5es de atua\u00e7\u00e3o geral. Esse procedimento permite compreender a imagem como evid\u00eancia de execu\u00e7\u00e3o, mem\u00f3ria institucional e apoio \u00e0 rastreabilidade do projeto.</p>
        <p>Sempre que dispon\u00edveis, s\u00e3o mantidos os metadados associados \u00e0s imagens, incluindo cr\u00e9dito, local, GPS, nome do arquivo, data, museu e atividade vinculada. Quando essas informa\u00e7\u00f5es n\u00e3o estiverem completas, o relat\u00f3rio preserva o dado existente sem produzir infer\u00eancias artificiais. Dessa forma, evita-se atribuir localiza\u00e7\u00e3o, autoria ou contexto n\u00e3o confirmados, mantendo a integridade documental da publica\u00e7\u00e3o.</p>
        <p>A estrutura deste relat\u00f3rio tamb\u00e9m adota crit\u00e9rio de uso \u00fanico das imagens. Cada fotografia deve aparecer apenas uma vez, vinculada \u00e0 atividade de origem ou ao agrupamento mais consistente identificado. Quando uma mesma imagem aparece associada a mais de uma atividade, o sistema deve verificar se h\u00e1 duplicidade de registro ou v\u00ednculo indevido. Nos casos em que se tratar da mesma atividade duplicada, os registros podem ser consolidados; quando forem atividades distintas, a imagem permanece apenas no v\u00ednculo mais forte, evitando repeti\u00e7\u00e3o no PDF.</p>
        <p>Com essa metodologia, a galeria deixa de funcionar como um anexo visual desorganizado e passa a operar como uma base de evid\u00eancias. As imagens comprovam a realiza\u00e7\u00e3o das atividades, demonstram os contextos de participa\u00e7\u00e3o, registram espa\u00e7os, materiais, p\u00fablicos, processos de media\u00e7\u00e3o e momentos de trabalho, contribuindo para a leitura institucional do per\u00edodo e para a transpar\u00eancia da execu\u00e7\u00e3o do projeto.</p>
        <p>No arquivo consolidado, a capa indica ${totalPhotos} imagens \u00fanicas organizadas em ${groups.length} atividades ou grupos, provenientes de ${totalChapters} cap\u00edtulos de origem, refor\u00e7ando a galeria como sistema de evid\u00eancias vinculadas, e n\u00e3o como conjunto solto de fotografias.</p>
  `;
}

function chunkGalleryGroupsForRender(groups = [], chunkSize = 4) {
  const safeChunkSize = Math.max(1, Number(chunkSize) || 4);

  return groups.flatMap((group) => {
    const photos = Array.isArray(group?.photos) ? group.photos : [];
    if (photos.length <= safeChunkSize) {
      return [{ ...group, renderChunkIndex: 1, renderChunkTotal: 1 }];
    }

    const total = Math.ceil(photos.length / safeChunkSize);
    return Array.from({ length: total }, (_, index) => ({
      ...group,
      photos: photos.slice(index * safeChunkSize, (index + 1) * safeChunkSize),
      renderChunkIndex: index + 1,
      renderChunkTotal: total,
    }));
  });
}

function buildGalleryReportDocument({ contexto = {}, filtros = {}, selectedChapters = [] } = {}) {
  const groupedActivities = buildGalleryGroups(contexto);
  const groups = chunkGalleryGroupsForRender(groupedActivities, 4);
  const totalPhotos = groupedActivities.reduce((sum, group) => sum + group.photos.length, 0);
  const generatedAt = new Date().toLocaleString('pt-BR');
  const period = `${filtros?.dateFrom || '2026-02-02'} a ${filtros?.dateTo || '2026-04-30'}`;
  const introHtml = buildGalleryIntroHtml({ totalPhotos, groups: groupedActivities, selectedChapters });

  const groupHtml = groups.map((group) => `
    <section class="gallery-activity avoid-break">
      <header class="gallery-activity-header">
        <div>
          <p>${escapeHtml(group.museu)} · ${escapeHtml(group.mes)}</p>
          <h2>${escapeHtml(group.atividade)}</h2>
          ${group.renderChunkTotal > 1 ? `<small class="gallery-activity-part">Bloco ${group.renderChunkIndex} de ${group.renderChunkTotal}</small>` : ''}
        </div>
        <strong>${group.photos.length} imagem(ns)</strong>
      </header>
      <div class="gallery-grid">
        ${group.photos.map((photo) => `
          <figure>
            <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(group.atividade)}" loading="eager" crossorigin="anonymous" referrerpolicy="no-referrer" />
            <figcaption>
              <span>${escapeHtml(photo.fileName)}</span>
              <small>Credito: ${escapeHtml(photo.credit)}</small>
              <small>Local: ${escapeHtml(photo.location)}</small>
            </figcaption>
          </figure>
        `).join('')}
      </div>
    </section>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Museus Centro - Relatorio Galeria</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f0ea; color: #171717; font-family: Arial, Helvetica, sans-serif; }
    .report-shell { max-width: 210mm; margin: 0 auto; background: #fff; }
    .gallery-cover { min-height: 297mm; padding: 26mm 18mm; display: flex; flex-direction: column; justify-content: space-between; background: #171717; color: #fff; page-break-after: always; }
    .gallery-cover h1 { font-size: 38pt; line-height: 1; margin: 0 0 14px; }
    .gallery-cover p { font-size: 13pt; line-height: 1.45; max-width: 150mm; }
    .cover-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20mm; }
    .cover-stats div { border: 1px solid rgba(255,255,255,.28); padding: 12px; }
    .cover-stats strong { display: block; font-size: 22pt; }
    .report-header { padding: 8mm 14mm 4mm; font-size: 8.5pt; line-height: 1.35; color: #5d554c; border-bottom: 1px solid #ded7cd; }
    .report-content { padding: 12mm 14mm 16mm; }
    .intro { margin-bottom: 12mm; border: 1px solid #ddd4c6; background: #fffdf8; padding: 12px 14px; }
    .intro h2 { font-size: 20pt; margin: 0 0 10px; }
    .intro .intro-lead { font-size: 11.6pt; line-height: 1.6; margin: 0 0 10px; color: #2c2c2c; }
    .intro p { font-size: 10.5pt; line-height: 1.58; margin: 0 0 9px; color: #342f2a; }
    .gallery-activity { padding: 8mm 0 10mm; border-top: 1px solid #ddd4c6; break-inside: avoid; page-break-inside: avoid; }
    .gallery-activity-header { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 8px; }
    .gallery-activity-header p { margin: 0 0 4px; font-size: 9pt; color: #6d6257; text-transform: uppercase; letter-spacing: .06em; }
    .gallery-activity-header h2 { margin: 0; font-size: 15pt; line-height: 1.25; }
    .gallery-activity-part { display: block; margin-top: 6px; font-size: 8pt; line-height: 1.3; color: #6d6257; text-transform: uppercase; letter-spacing: .08em; }
    .gallery-activity-header strong { white-space: nowrap; font-size: 9pt; border: 1px solid #cfc6ba; padding: 5px 7px; }
    .gallery-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
    img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #ddd4c6; border: 1px solid #ddd4c6; }
    figcaption { margin-top: 5px; font-size: 8.4pt; line-height: 1.35; color: #514a43; }
    figcaption span, figcaption small { display: block; }
    .report-footer { padding: 4mm 14mm 8mm; font-size: 8.5pt; color: #6d6257; border-top: 1px solid #ded7cd; }
    @media print {
      @page { size: A4; margin: 16mm 14mm 16mm 14mm; }
      body { background: #fff; }
      .report-shell { max-width: none; width: auto; margin: 0; }
      .gallery-cover { width: auto; min-height: auto; height: auto; margin: -16mm -14mm 0; padding: 32mm 20mm; }
      .avoid-break, figure, .gallery-activity { break-inside: avoid; page-break-inside: avoid; }
      .report-header, .report-footer { padding-left: 0; padding-right: 0; }
      .report-content { padding-left: 0; padding-right: 0; }
    }
  </style>
</head>
<body>
  <main class="report-shell">
    <section class="gallery-cover">
      <div>
        <p>Museus Centro · Viaduto das Artes</p>
        <h1>Relatorio Galeria</h1>
        <p>Imagens organizadas por atividade, museu e periodo, com deduplicacao tecnica para impedir repeticao no PDF.</p>
      </div>
      <div>
        <p>Periodo: ${escapeHtml(period)}</p>
        <div class="cover-stats">
          <div><strong>${totalPhotos}</strong><span>imagens unicas</span></div>
          <div><strong>${groups.length}</strong><span>atividades/grupos</span></div>
          <div><strong>${selectedChapters.length || REPORT_CHAPTER_IDS.length}</strong><span>capitulos de origem</span></div>
        </div>
      </div>
    </section>
    <div class="report-header">
      Viaduto das Artes - Fundado em 16 de junho de 2015<br />
      Av. Olinto Meireles, 45 - Barreiro - Belo Horizonte/MG<br />
      CEP 30640-010 - E-mail: viadutodasartes@gmail.com
    </div>
    <div class="report-content">
      <section class="intro">${introHtml}</section>
      <section class="intro legacy-gallery-intro" style="display:none;">
        <h2>Relatório Galeria — evidências visuais, atividades e geolocalização</h2>
        <p class="intro-lead">Este Relatório Galeria organiza as imagens registradas no âmbito do Projeto Museus Centro como evidências visuais das atividades realizadas no período de 2 de fevereiro a 30 de abril de 2026. As fotografias não são tratadas como uma galeria genérica ou meramente ilustrativa, mas como documentos vinculados às ações registradas pela equipe, preservando a relação entre imagem, atividade, museu, data, relatório de origem e, quando disponível, geolocalização.</p>
        <p>A organização das imagens parte do princípio de que cada registro fotográfico comprova, qualifica ou contextualiza uma atividade específica. Assim, as imagens são agrupadas a partir do vínculo original informado nos relatórios da equipe e associadas aos respectivos equipamentos culturais — Museu Histórico Abílio Barreto, Museu da Imagem e do Som, Museu da Moda ou ações de atuação geral. Esse procedimento permite compreender a imagem como evidência de execução, memória institucional e apoio à rastreabilidade do projeto.</p>
        <p>Sempre que disponíveis, são mantidos os metadados associados às imagens, incluindo crédito, local, GPS, nome do arquivo, data, museu e atividade vinculada. Quando essas informações não estiverem completas, o relatório preserva o dado existente sem produzir inferências artificiais. Dessa forma, evita-se atribuir localização, autoria ou contexto não confirmados, mantendo a integridade documental da publicação.</p>
        <p>A estrutura deste relatório também adota critério de uso único das imagens. Cada fotografia deve aparecer apenas uma vez, vinculada à atividade de origem ou ao agrupamento mais consistente identificado. Quando uma mesma imagem aparece associada a mais de uma atividade, o sistema deve verificar se há duplicidade de registro ou vínculo indevido. Nos casos em que se tratar da mesma atividade duplicada, os registros podem ser consolidados; quando forem atividades distintas, a imagem permanece apenas no vínculo mais forte, evitando repetição no PDF.</p>
        <p>Com essa metodologia, a galeria deixa de funcionar como um anexo visual desorganizado e passa a operar como uma base de evidências. As imagens comprovam a realização das atividades, demonstram os contextos de participação, registram espaços, materiais, públicos, processos de mediação e momentos de trabalho, contribuindo para a leitura institucional do período e para a transparência da execução do projeto.</p>
        <p>No arquivo consolidado, a capa indica ${totalPhotos} imagens únicas organizadas em ${groups.length} atividades ou grupos, provenientes de ${selectedChapters.length || REPORT_CHAPTER_IDS.length} capítulos de origem, reforçando a galeria como sistema de evidências vinculadas, e não como conjunto solto de fotografias.</p>
      </section>
      ${groupHtml || '<p>Nenhuma imagem com URL foi localizada para a galeria.</p>'}
    </div>
    <div class="report-footer">Museus Centro - Relatorio Galeria | Gerado em ${escapeHtml(generatedAt)}</div>
  </main>
</body>
</html>`;
}

export function buildSingleReportMeta({ html = '', selectedChapters = [], warnings = [] } = {}) {
  const imageCount = countHtmlImages(html);
  const estimatedSizeMB = estimateHtmlSizeMB(html);
  return {
    reportType: 'fisico_financeiro',
    exportMode: 'single_pdf',
    generatedAt: new Date().toISOString(),
    selectedChapters: normalizeSelectedReportChapterIds(selectedChapters),
    estimatedPages: estimateHtmlPages(html),
    estimatedSizeMB,
    imageCount,
    optimizedImageCount: imageCount,
    removedEmptySections: 0,
    warnings: [
      ...(estimatedSizeMB > 180 ? ['HTML pesado para exportacao; imagens foram otimizadas antes da previa.'] : []),
      ...warnings,
    ],
  };
}

export async function buildSingleReportHtml({
  museu = 'Todos',
  premium = true,
  secoesSelecionadas = REPORT_CHAPTER_IDS,
  selectedInlinePhotoIds = [],
} = {}) {
  const result = await buildVolumeHtml({
    museu,
    premium,
    secoesSelecionadas,
    splitContext: null,
    selectedInlinePhotoIds,
  });
  const html = cleanEmptyReportSections(repairReportEncoding(result.html));
  return {
    html,
    contexto: result.contexto,
    meta: buildSingleReportMeta({
      html,
      selectedChapters: secoesSelecionadas,
    }),
  };
}

export async function buildSeparatedReportsHtml({
  museu = 'Todos',
  premium = true,
  secoesSelecionadas = REPORT_CHAPTER_IDS,
  selectedInlinePhotoIds = [],
} = {}) {
  const normalizedSections = normalizeSelectedReportChapterIds(secoesSelecionadas);
  const dataSections = normalizedSections.filter((sectionId) => !['galeria_evidencias', 'galeria_premium'].includes(sectionId));

  const dataResult = await buildVolumeHtml({
    museu,
    premium,
    secoesSelecionadas: dataSections,
    splitContext: null,
    selectedInlinePhotoIds,
  });

  const galleryInitialHtml = buildGalleryReportDocument({
    contexto: dataResult.contexto,
    filtros: dataResult.filtros,
    selectedChapters: normalizedSections,
  });
  const galleryOptimizedHtml = await optimizeReportHtmlImages(galleryInitialHtml, REPORT_IMAGE_OPTIMIZATION_OPTIONS);
  const galleryHtml = cleanEmptyReportSections(repairReportEncoding(galleryOptimizedHtml));
  const dataHtml = cleanEmptyReportSections(stripGalleryImagesFromDataReport(repairReportEncoding(dataResult.html)));

  return {
    data: {
      html: dataHtml,
      contexto: dataResult.contexto,
      meta: buildSingleReportMeta({
        html: dataHtml,
        selectedChapters: dataSections,
        warnings: ['Relatorio principal sem galeria fotografica; imagens foram separadas no Relatorio Galeria.'],
      }),
    },
    gallery: {
      html: galleryHtml,
      contexto: dataResult.contexto,
      meta: buildSingleReportMeta({
        html: galleryHtml,
        selectedChapters: normalizedSections,
      }),
    },
  };
}

function savePreviewHtmlToIndexedDb(key, value) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) {
        db.createObjectStore(PREVIEW_DB_STORE);
      }
    };
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(PREVIEW_DB_STORE, 'readwrite');
      tx.objectStore(PREVIEW_DB_STORE).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    };
  });
}

function getPreviewHtmlFromIndexedDb(key) {
  if (typeof indexedDB === 'undefined') return Promise.resolve('');

  return new Promise((resolve) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PREVIEW_DB_STORE)) {
        db.createObjectStore(PREVIEW_DB_STORE);
      }
    };
    request.onerror = () => resolve('');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(PREVIEW_DB_STORE, 'readonly');
      const getRequest = tx.objectStore(PREVIEW_DB_STORE).get(key);
      getRequest.onsuccess = () => {
        const value = getRequest.result;
        db.close();
        resolve(typeof value === 'string' ? value : value?.html || '');
      };
      getRequest.onerror = () => {
        db.close();
        resolve('');
      };
    };
  });
}

export async function saveVolumePreview({ volumeNumber = 1, html = '', meta = {} } = {}) {
  const htmlKey = getVolumeHtmlKey(volumeNumber);
  const metaKey = getVolumeMetaKey(volumeNumber);
  const payloadMeta = {
    volumeNumber: Number(volumeNumber) || 1,
    totalVolumes: EXPORT_VOLUME_COUNT,
    pageNumberOffset: 0,
    ...meta,
  };

  try {
    sessionStorage.setItem(htmlKey, html);
    sessionStorage.setItem(metaKey, JSON.stringify(payloadMeta));
  } catch (error) {
    console.warn('Nao foi possivel salvar previa do volume em sessionStorage:', error);
  }

  try {
    localStorage.setItem(htmlKey, html);
    localStorage.setItem(metaKey, JSON.stringify(payloadMeta));
  } catch (error) {
    console.warn('Nao foi possivel salvar previa do volume em localStorage:', error);
  }

  await savePreviewHtmlToIndexedDb(htmlKey, {
    html,
    meta: payloadMeta,
    savedAt: payloadMeta.generatedAt || new Date().toISOString(),
  });
}

export async function saveSingleReportPreview({ html = '', meta = {} } = {}) {
  return saveReportPreview('single', { html, meta });
}

export async function saveReportPreview(variant = 'single', { html = '', meta = {} } = {}) {
  const config = REPORT_PREVIEW_VARIANTS[variant] || REPORT_PREVIEW_VARIANTS.single;
  const finalHtml = cleanEmptyReportSections(repairReportEncoding(html));
  const payloadMeta = {
    ...buildSingleReportMeta({ html: finalHtml, selectedChapters: meta.selectedChapters || [] }),
    ...meta,
    reportType: 'fisico_financeiro',
    exportMode: config.exportMode,
    reportVariant: variant,
  };
  try {
    sessionStorage.setItem(config.htmlKey, finalHtml);
    sessionStorage.setItem(config.metaKey, JSON.stringify(payloadMeta));
    if (variant === 'single') {
      sessionStorage.setItem(SINGLE_REPORT_HTML_KEY, finalHtml);
      sessionStorage.setItem(SINGLE_REPORT_META_KEY, JSON.stringify(payloadMeta));
    }
  } catch (error) {
    console.warn('Nao foi possivel salvar previa unica em sessionStorage:', error);
  }

  try {
    localStorage.setItem(config.htmlKey, finalHtml);
    localStorage.setItem(config.metaKey, JSON.stringify(payloadMeta));
    localStorage.setItem(`${config.htmlKey}_saved_at`, payloadMeta.generatedAt || new Date().toISOString());
    if (variant === 'single') {
      localStorage.setItem(SINGLE_REPORT_HTML_KEY, finalHtml);
      localStorage.setItem(SINGLE_REPORT_META_KEY, JSON.stringify(payloadMeta));
      localStorage.setItem(`${SINGLE_REPORT_HTML_KEY}_saved_at`, payloadMeta.generatedAt || new Date().toISOString());
    }
  } catch (error) {
    console.warn('Nao foi possivel salvar previa unica em localStorage:', error);
  }

  await savePreviewHtmlToIndexedDb(config.htmlKey, {
    html: finalHtml,
    meta: payloadMeta,
    savedAt: payloadMeta.generatedAt || new Date().toISOString(),
  });
}

export async function getVolumePreview(volumeNumber = 1) {
  const htmlKey = getVolumeHtmlKey(volumeNumber);
  const metaKey = getVolumeMetaKey(volumeNumber);
  let html = '';
  let meta = null;

  try {
    html = sessionStorage.getItem(htmlKey) || localStorage.getItem(htmlKey) || '';
    meta = JSON.parse(sessionStorage.getItem(metaKey) || localStorage.getItem(metaKey) || 'null');
  } catch {
    meta = null;
  }

  if (!html) html = await getPreviewHtmlFromIndexedDb(htmlKey);

  return {
    html,
    meta: meta || {
      volumeNumber: Number(volumeNumber) || 1,
      totalVolumes: EXPORT_VOLUME_COUNT,
      pageNumberOffset: 0,
    },
  };
}

export async function getSingleReportPreview() {
  return getReportPreview('single');
}

export async function getReportPreview(variant = 'single') {
  const config = REPORT_PREVIEW_VARIANTS[variant] || REPORT_PREVIEW_VARIANTS.single;
  let html = '';
  let meta = null;

  try {
    html = sessionStorage.getItem(config.htmlKey) || localStorage.getItem(config.htmlKey) || '';
    meta = JSON.parse(sessionStorage.getItem(config.metaKey) || localStorage.getItem(config.metaKey) || 'null');
  } catch {
    meta = null;
  }

  if (!html) html = await getPreviewHtmlFromIndexedDb(config.htmlKey);
  if (!html && variant === 'single') html = await getPreviewHtmlFromIndexedDb(SINGLE_REPORT_HTML_KEY);

  return {
    html,
    meta: meta || buildSingleReportMeta({ html }),
  };
}

export async function exportVolumePdf({ html, exporter, volumeMeta = {} } = {}) {
  if (typeof exporter !== 'function') {
    throw new Error('Exportador PDF indisponivel.');
  }

  return exporter(html, {
    pageNumberOffset: Number(volumeMeta.pageNumberOffset) || 0,
    volumeNumber: Number(volumeMeta.volumeNumber) || 1,
    totalVolumes: Number(volumeMeta.totalVolumes) || EXPORT_VOLUME_COUNT,
    includeSearchableAppendix: false,
  });
}

export async function exportSingleReportPdf({ html, exporter, meta = {} } = {}) {
  if (typeof exporter !== 'function') {
    throw new Error('Exportador PDF indisponivel.');
  }

  return exporter(html, {
    pageNumberOffset: 0,
    reportTitle: REPORT_PREVIEW_VARIANTS[meta?.reportVariant]?.title || 'Museus Centro - Relatorio Fisico-Financeiro',
    includeSearchableAppendix: false,
    targetSizeMB: 180,
    maxSizeMB: 200,
    meta,
  });
}
