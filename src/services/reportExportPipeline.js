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
import { loadGalleryReportData } from '@/utils/galleryReportData';
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
export const ACTIVITIES_REPORT_FILENAME = 'Museus-Centro-Relatorio-Atividades.pdf';
export const SINGLE_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_html';
export const SINGLE_REPORT_META_KEY = 'relatorio_fisico_financeiro_meta';
export const DATA_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_dados_html';
export const DATA_REPORT_META_KEY = 'relatorio_fisico_financeiro_dados_meta';
export const GALLERY_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_galeria_html';
export const GALLERY_REPORT_META_KEY = 'relatorio_fisico_financeiro_galeria_meta';
export const ACTIVITIES_REPORT_HTML_KEY = 'relatorio_fisico_financeiro_atividades_html';
export const ACTIVITIES_REPORT_META_KEY = 'relatorio_fisico_financeiro_atividades_meta';
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
  atividades: {
    htmlKey: ACTIVITIES_REPORT_HTML_KEY,
    metaKey: ACTIVITIES_REPORT_META_KEY,
    filename: ACTIVITIES_REPORT_FILENAME,
    title: 'Museus Centro - Relatório de Atividades',
    exportMode: 'activities_pdf',
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

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyOfficialDashboardMetricsToContext(contexto = {}, dashboardMetrics = {}, rawData = {}) {
  if (!contexto || typeof contexto !== 'object') return contexto;
  const metrics = dashboardMetrics && typeof dashboardMetrics === 'object' ? dashboardMetrics : {};

  const approvedReports = toSafeNumber(metrics?.reports?.approved, toSafeNumber(metrics?.reports?.total, contexto.total_relatorios || 0));
  const officialActivities = toSafeNumber(metrics?.activities?.total, contexto.total_atividades || 0);
  const officialAudience = toSafeNumber(metrics?.audience?.publicoTotal, contexto.publico_total || 0);
  const officialExecPct = toSafeNumber(metrics?.financeiro?.percentualExecucao, contexto.percentual_execucao || 0);

  const programacaoFromMetrics = toSafeNumber(
    metrics?.programacao?.total,
    toSafeNumber(metrics?.programacao_total, NaN),
  );
  const officialProgramacao = Number.isFinite(programacaoFromMetrics)
    ? programacaoFromMetrics
    : toSafeNumber(rawData?.programacaoRaw?.length, contexto.programacao_total || 0);

  const equipeFromMetrics = toSafeNumber(
    metrics?.equipe?.total,
    toSafeNumber(metrics?.equipe_total, NaN),
  );
  const officialEquipe = Number.isFinite(equipeFromMetrics)
    ? equipeFromMetrics
    : toSafeNumber(contexto.equipe_total, 0);

  return {
    ...contexto,
    total_relatorios: approvedReports,
    total_atividades: officialActivities,
    publico_total: officialAudience,
    programacao_total: officialProgramacao,
    equipe_total: officialEquipe,
    percentual_execucao: officialExecPct,
    dashboard_metrics: metrics,
    metricas_dashboard: metrics,
    dashboardMetrics: metrics,
  };
}

async function withRetry(fn, { retries = 5, baseDelay = 1200 } = {}) {
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
      console.debug(`Entidade opcional ausente no relatorio (${key}).`);
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
    ['documentIntakeRaw', () => safeList(base44.entities.DocumentIntake, '-created_date', 2000, { cacheKey: 'DocumentIntake', required: true })],
    ['attachmentsRaw', () => safeList(base44.entities.Attachment, '-created_date', 3000, { cacheKey: 'Attachment', required: true })],
    ['presenceRecordsRaw', () => safeList(base44.entities.PresenceRecord, '-data', 5000, { cacheKey: 'PresenceRecord' })],
    ['metasRaw', async () => []],
    ['programacaoRaw', () => safeList(base44.entities.Programacao, '-data_inicio', 3000, { cacheKey: 'Programacao', required: true })],
    ['conhecimentoRaw', async () => []],
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
      presenceRecordsRaw = [],
      metasRaw = [],
      programacaoRaw = [],
      conhecimentoRaw = [],
    },
    errors: loadErrors = [],
  } = await loadReportEntitiesSafely();
  const galleryRaw = [];

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

  const contextoComMetricasOficiais = applyOfficialDashboardMetricsToContext(
    contexto,
    dashboardMetrics,
    { programacaoRaw },
  );

  return {
    contexto: {
      ...contextoComMetricasOficiais,
      dashboard_metrics: dashboardMetrics,
      dashboard_data_source: {
        reports: reportsRaw.length,
        programacao: programacaoRaw.length,
        rubricas: rubricasRaw.length,
        metas: metasRaw.length,
        attachments: attachmentsRaw.length,
        gallery: 0,
        presenceRecords: presenceRecordsRaw.length,
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
  clone.querySelectorAll('table').forEach((table) => {
    if (table.querySelectorAll('tbody tr, tr').length === 0) table.remove();
  });
  const text = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
  const usefulTables = Array.from(clone.querySelectorAll?.('table') || [])
    .filter((table) => String(table.textContent || '').replace(/\s+/g, ' ').trim().length > 18);
  const visualCount = clone.querySelectorAll?.('img[src], canvas, svg, figure, .premium-metric, .premium-infographic-card').length || 0;
  return text.length > 18 || usefulTables.length > 0 || visualCount > 0;
}

function normalizeForReportMatch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function removeTableColumnsByHeader(table, patterns = []) {
  const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'));
  const indexes = headerCells
    .map((cell, index) => ({ index, text: normalizeForReportMatch(cell.textContent) }))
    .filter(({ text }) => patterns.some((pattern) => pattern.test(text)))
    .map(({ index }) => index);

  if (indexes.length === 0) return;

  Array.from(table.querySelectorAll('tr')).forEach((row) => {
    indexes.slice().sort((a, b) => b - a).forEach((index) => {
      row.children[index]?.remove();
    });
  });
}

function removeForbiddenReportResidue(doc) {
  const forbiddenBlockPatterns = [
    /campos consolidados/i,
    /clique para detalhar/i,
    /ver memoria(?: de calculo| geral)?/i,
    /created_date/i,
    /updated_date/i,
    /\batividades\b.*\[[\s\S]{0,160}\]/i,
    /\bfotos\b.*\[[\s\S]{0,160}\]/i,
    /\btrechos\b.*\[[\s\S]{0,160}\]/i,
    /\bids?\b.*\[[\s\S]{0,160}\]/i,
    /"\w+"\s*:\s*(?:"[^"]*"|\[|\{)/,
  ];
  const forbiddenTextPatterns = [
    /Campos consolidados/gi,
    /Clique para detalhar/gi,
    /Ver mem[oó]ria de c[aá]lculo/gi,
    /Ver mem[oó]ria geral/gi,
  ];

  doc.querySelectorAll('table').forEach((table) => {
    removeTableColumnsByHeader(table, [/campos consolidados/]);
    const rows = table.querySelectorAll('tbody tr, tr');
    const usefulText = String(table.textContent || '').replace(/\s+/g, ' ').trim();
    if (rows.length === 0 || usefulText.length < 12) table.remove();
  });

  doc.querySelectorAll('pre, code, textarea, .json, [data-json], [data-raw], [data-debug]').forEach((node) => node.remove());

  doc.querySelectorAll('section, article, div, aside, details').forEach((node) => {
    if (node.classList?.contains('premium-cover')) return;
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeForReportMatch(text);
    if (!text) return;
    if (forbiddenBlockPatterns.some((pattern) => pattern.test(normalized) || pattern.test(text))) {
      node.remove();
    }
  });

  const showText = (typeof NodeFilter !== 'undefined' ? NodeFilter : doc.defaultView?.NodeFilter)?.SHOW_TEXT || 4;
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, showText);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    let value = node.nodeValue || '';
    forbiddenTextPatterns.forEach((pattern) => {
      value = value.replace(pattern, '');
    });
    node.nodeValue = value;
  });
}

export function sanitizeReportHtmlBeforeSave(html = '') {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(repairReportEncoding(String(html)), 'text/html');
    doc.querySelector('meta[charset]')?.setAttribute('charset', 'UTF-8');

    removeForbiddenReportResidue(doc);

    doc.querySelectorAll('[style]').forEach((node) => {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      const style = String(node.getAttribute('style') || '');
      if (!text && /min-height\s*:\s*(?:[2-9]\d{2,}|[12]\d{2,}mm|[4-9]\dvh)/i.test(style)) {
        node.removeAttribute('style');
      }
    });

    doc.querySelectorAll('.premium-page-break').forEach((node) => {
      if (!elementHasUsefulContent(node)) node.classList.remove('premium-page-break');
    });

    doc.querySelectorAll('section, article, div').forEach((node) => {
      if (node.classList?.contains('premium-cover')) return;
      if (!elementHasUsefulContent(node)) node.remove();
    });

    doc.querySelectorAll('.premium-page-break').forEach((node) => {
      let previous = node.previousElementSibling;
      while (previous && !elementHasUsefulContent(previous)) {
        const candidate = previous.previousElementSibling;
        previous.remove();
        previous = candidate;
      }
      if (previous?.classList?.contains('premium-page-break')) node.classList.remove('premium-page-break');
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('Falha ao sanitizar HTML final do relatorio:', error);
    return html;
  }
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
  const html = sanitizeReportHtmlBeforeSave(
    removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(repairReportEncoding(htmlOtimizado)))
  );

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

export function removeNegativeAndRemovedBlocksFromReport(html = '') {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const patterns = [
      /Síntese,\s*alertas\s*e\s*governança/i,
      /Alertas\s*financeiros/i,
      /Duplicidades\s*evitadas/i,
      /Imagens\s*sem\s*vínculo\s*suficiente/i,
      /Alertas\s*principais/i,
      /Há rubricas sem vínculo explícito/i,
      /solicitações aprovadas sem rubrica vinculada/i,
      /Revisar vínculo manualmente/i,
      /Pendências e limitações/i,
      /Alertas de consistência/i,
      /Atividades\s+por\s+museu/i,
      /Páginas\s+por\s+museu/i,
      /Seção especial Noturno nos Museus/i,
    ];

    doc.querySelectorAll('section, article, div').forEach((node) => {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const head = text.slice(0, 900);
      const normalizedHead = normalizeForReportMatch(head);
      if (patterns.some((pattern) => pattern.test(head) || pattern.test(normalizedHead))) node.remove();
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch {
    return html;
  }
}

export const removeNegativeAlertBlocksFromReport = removeNegativeAndRemovedBlocksFromReport;

export function cleanGalleryReportPdfHtml(html = '') {
  if (!html || typeof DOMParser === 'undefined') return html;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    doc.querySelectorAll('button, .pdf-hide, [data-pdf-hide="true"]').forEach((el) => el.remove());

    doc.querySelectorAll('.gallery-card-caption').forEach((el) => {
      el.textContent = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    });

    doc.querySelectorAll('.gallery-card-meta, .gallery-file-name').forEach((el) => {
      el.textContent = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    });

    doc.body.innerHTML = doc.body.innerHTML
      .replaceAll('Campos consolidados', '')
      .replaceAll('Clique para detalhar', '');

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}

function isApprovedReportStatus(status = '') {
  const value = String(status || '').trim().toUpperCase();
  return [
    'APPROVED',
    'APROVADO',
    'APROVADO_COORD',
    'APROVADO_ADMIN',
    'APROVADO_COORDENACAO',
    'APROVADO_COORDENAÇÃO',
  ].includes(value);
}

function normalizeActivityRecord(activity = {}, report = {}) {
  const dateValue = activity?.data || activity?.date || activity?.data_atividade || report?.created_date || report?.updated_date || '';
  const title = activity?.titulo || activity?.nome || activity?.acao || activity?.atividade || 'Atividade sem título';
  const museum = activity?.museu || activity?.equipamento || report?.museu || report?.centro_custo || 'Atuação geral';
  const publico = Number(activity?.publico || activity?.publico_total || activity?.publico_registrado || activity?.participantes || 0);
  const anexos = [
    ...(Array.isArray(activity?.anexos) ? activity.anexos : []),
    ...(Array.isArray(activity?.attachments) ? activity.attachments : []),
    ...(Array.isArray(activity?.fotos) ? activity.fotos : []),
    ...(Array.isArray(activity?.imagens) ? activity.imagens : []),
  ].filter(Boolean);

  return {
    ...activity,
    __title: String(title),
    __date: String(dateValue || ''),
    __museum: String(museum),
    __publico: Number.isFinite(publico) ? publico : 0,
    __anexos: anexos,
    __reportId: report?.id || '',
    __reportAuthor: report?.author_name || report?.autor || report?.responsavel || '',
    __reportStatus: report?.status || '',
    __reportMonth: report?.mes_referencia || report?.mes || '',
    __reportYear: report?.ano || '',
  };
}

function formatDateForReport(value = '') {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('pt-BR');
}

function escapeHtmlBlock(text = '') {
  return escapeHtml(String(text || '')).replace(/\n/g, '<br/>');
}

function renderLabeledText(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `<div class="activity-text-block"><h4>${escapeHtml(label)}</h4><p>${escapeHtmlBlock(text)}</p></div>`;
}

export async function loadActivitiesReportData({
  museu = 'Todos',
  periodo = null,
  forceRefresh = false,
} = {}) {
  if (forceRefresh) clearReportDataCache();
  const reportsRaw = await safeList(base44.entities.Report, '-created_date', 3000, { cacheKey: 'ReportActivities', required: true });
  const approved = (Array.isArray(reportsRaw) ? reportsRaw : []).filter((report) => isApprovedReportStatus(report?.status));
  const museuFiltro = String(museu || 'Todos');
  const filteredReports = approved.filter((report) => {
    if (museuFiltro === 'Todos') return true;
    const reportMuseum = String(report?.museu || report?.centro_custo || '').trim().toUpperCase();
    return reportMuseum === museuFiltro.trim().toUpperCase();
  });

  const reports = filteredReports
    .map((report) => ({
      ...report,
      atividades: Array.isArray(report?.atividades) ? report.atividades : [],
    }))
    .sort((a, b) => String(a?.museu || '').localeCompare(String(b?.museu || ''), 'pt-BR')
      || String(a?.mes_referencia || '').localeCompare(String(b?.mes_referencia || ''), 'pt-BR')
      || String(a?.created_date || '').localeCompare(String(b?.created_date || ''), 'pt-BR'));

  const activities = reports.flatMap((report) => report.atividades.map((activity) => normalizeActivityRecord(activity, report)));
  const filteredActivities = Array.isArray(periodo) && periodo.length === 2
    ? activities.filter((activity) => {
      const d = new Date(activity.__date);
      const from = new Date(periodo[0]);
      const to = new Date(periodo[1]);
      if (Number.isNaN(d.getTime()) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return true;
      return d >= from && d <= to;
    })
    : activities;

  const groupedByMuseum = filteredActivities.reduce((acc, item) => {
    const key = item.__museum || 'Atuação geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupedByMonth = filteredActivities.reduce((acc, item) => {
    const key = `${item.__reportMonth || '-'}-${item.__reportYear || '-'}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupedByAuthor = reports.reduce((acc, report) => {
    const key = report?.author_name || report?.autor || report?.responsavel || 'Não informado';
    if (!acc[key]) acc[key] = [];
    acc[key].push(report);
    return acc;
  }, {});

  const totalAudience = filteredActivities.reduce((sum, item) => sum + (Number(item.__publico) || 0), 0);
  const totalPhotos = filteredActivities.reduce((sum, item) => sum + ((item.__anexos || []).length), 0);

  return {
    reports,
    activities: filteredActivities,
    groupedByMuseum,
    groupedByMonth,
    groupedByAuthor,
    summary: {
      totalReports: reports.length,
      totalActivities: filteredActivities.length,
      totalAudience,
      totalMuseums: Object.keys(groupedByMuseum).length,
      totalAuthors: Object.keys(groupedByAuthor).length,
      totalPhotos,
      totalAttachments: totalPhotos,
    },
    generatedAt: new Date().toISOString(),
    sourcePage: '/Relatorios',
    warnings: [],
  };
}

export function buildActivitiesReportHtml(activitiesData = {}, options = {}) {
  const reports = Array.isArray(activitiesData?.reports) ? activitiesData.reports : [];
  const activities = Array.isArray(activitiesData?.activities) ? activitiesData.activities : [];
  const groupedByMuseum = activitiesData?.groupedByMuseum || {};
  const summary = activitiesData?.summary || {};
  const generatedAt = activitiesData?.generatedAt || new Date().toISOString();
  const periodoLabel = options?.periodoLabel || 'Período consolidado do app';

  const museums = Object.keys(groupedByMuseum);
  const museumSummaryRows = museums.map((museum) => {
    const list = groupedByMuseum[museum] || [];
    const publico = list.reduce((sum, item) => sum + (Number(item.__publico) || 0), 0);
    return { museum, totalActivities: list.length, totalAudience: publico };
  });

  const activitiesTableRows = activities.map((activity) => `
    <tr>
      <td>${escapeHtml(formatDateForReport(activity.__date))}</td>
      <td>${escapeHtml(activity.__museum)}</td>
      <td>${escapeHtml(activity.__title)}</td>
      <td>${escapeHtml(activity?.natureza || activity?.categoria || activity?.tipo || '-')}</td>
      <td style="text-align:right">${escapeHtml(String(activity.__publico || 0))}</td>
      <td>${escapeHtml(activity.__reportAuthor || '-')}</td>
    </tr>
  `).join('');

  const museumSections = museums.map((museum) => {
    const list = groupedByMuseum[museum] || [];
    const uniqueReports = new Set(list.map((item) => item.__reportId).filter(Boolean));
    const publico = list.reduce((sum, item) => sum + (Number(item.__publico) || 0), 0);
    const authors = new Set(list.map((item) => item.__reportAuthor).filter(Boolean));

    const cards = list.map((activity, index) => {
      const thumbs = (activity.__anexos || []).slice(0, 4);
      const thumbsHtml = thumbs.length > 0
        ? `<div class="activity-thumbs">${thumbs.map((asset) => `<img src="${escapeHtml(asset?.url || asset?.file_url || '')}" alt="${escapeHtml(activity.__title)}" loading="lazy" decoding="async" onerror="this.style.display='none'" />`).join('')}</div>`
        : '';

      return `
        <article class="activity-full-card avoid-break">
          <h3>${escapeHtml(`${index + 1}. ${activity.__title}`)}</h3>
          <div class="activity-meta-grid">
            <div><span>Data</span><strong>${escapeHtml(formatDateForReport(activity.__date))}</strong></div>
            <div><span>Museu</span><strong>${escapeHtml(activity.__museum)}</strong></div>
            <div><span>Natureza</span><strong>${escapeHtml(activity?.natureza || activity?.categoria || activity?.tipo || '-')}</strong></div>
            <div><span>Público</span><strong>${escapeHtml(String(activity.__publico || 0))}</strong></div>
            <div><span>Relatório</span><strong>${escapeHtml(activity.__reportAuthor || '-')}</strong></div>
            <div><span>Status</span><strong>${escapeHtml(activity.__reportStatus || '-')}</strong></div>
          </div>
          ${renderLabeledText(activity?.descricao || activity?.descricao_atividade || activity?.resumo, 'Descrição')}
          ${renderLabeledText(activity?.objetivos, 'Objetivos')}
          ${renderLabeledText(activity?.resultados, 'Resultados')}
          ${renderLabeledText(activity?.observacoes || activity?.observações, 'Observações')}
          ${thumbsHtml}
        </article>
      `;
    }).join('');

    return `
      <section class="activities-section">
        <h2>${escapeHtml(museum)}</h2>
        <p class="museum-kpi">Relatórios: ${uniqueReports.size} · Atividades: ${list.length} · Público: ${publico} · Profissionais: ${authors.size}</p>
        ${cards}
      </section>
    `;
  }).join('');

  const approvedReportsHtml = reports.map((report) => `
    <article class="approved-report-card avoid-break">
      <header>
        <h3>${escapeHtml(report?.author_name || report?.autor || 'Autor não informado')} — ${escapeHtml(report?.funcao || report?.função || 'Função não informada')}</h3>
        <p>${escapeHtml(report?.museu || '-')} · ${escapeHtml(report?.mes_referencia || report?.mes || '-')}/${escapeHtml(report?.ano || '-')} · ${escapeHtml(report?.status || '-')}</p>
      </header>
      ${renderLabeledText(report?.resumo_executivo, 'Resumo executivo')}
      ${renderLabeledText(report?.resumo_periodo, 'Resumo do período')}
      ${renderLabeledText(report?.pontos_positivos, 'Pontos positivos')}
      ${renderLabeledText(report?.desafios, 'Desafios')}
      ${renderLabeledText(report?.observacoes || report?.observações, 'Observações')}
      <p class="report-activity-count">Atividades vinculadas: ${Array.isArray(report?.atividades) ? report.atividades.length : 0}</p>
    </article>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Atividades</title>
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
    body { background:#f7f3eb; color:#171717; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .activities-report { width:186mm; margin:0 auto; }
    .activities-cover { min-height:297mm; page-break-after:always; background:#171717; color:#fff; padding:26mm 18mm; display:flex; flex-direction:column; justify-content:space-between; }
    .activities-section { padding:10mm 0; }
    .activities-section h2 { font-family: Georgia, "Times New Roman", serif; font-size:26pt; line-height:1.05; margin:0 0 5mm; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .internal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10mm; border-bottom:1px solid rgba(23,23,23,.14); padding-bottom:5mm; margin:8mm 0; }
    .internal-header img { width:34mm; max-width:34mm; height:auto; object-fit:contain; }
    .internal-header .txt { flex:1; text-align:right; font-size:8.5pt; line-height:1.35; color:#555; font-weight:600; }
    .summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4mm; margin:6mm 0 8mm; }
    .summary-card { border:1px solid rgba(23,23,23,.14); background:#fff; padding:4mm; }
    .summary-card span { display:block; font-size:7.2pt; text-transform:uppercase; letter-spacing:.06em; color:#6b6258; font-weight:700; }
    .summary-card strong { display:block; font-size:14pt; margin-top:2mm; }
    .activities-summary-table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:8.5pt; line-height:1.3; background:#fff; }
    .activities-summary-table th { background:#171717; color:#fff; padding:3mm 2.5mm; text-align:left; font-size:7.2pt; text-transform:uppercase; letter-spacing:.04em; }
    .activities-summary-table td { padding:2.5mm; border-top:1px solid rgba(23,23,23,.10); vertical-align:top; word-break:normal; overflow-wrap:break-word; }
    .activities-summary-table tbody tr:nth-child(even) td { background:rgba(23,23,23,.035); }
    .activity-full-card { break-inside:avoid; page-break-inside:avoid; border:1px solid rgba(23,23,23,.14); background:#fff; padding:5mm; margin-bottom:6mm; }
    .activity-full-card h3 { margin:0 0 3mm; font-family: Georgia, "Times New Roman", serif; font-size:15pt; line-height:1.2; }
    .activity-meta-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:3mm; margin-bottom:4mm; }
    .activity-meta-grid div { border-top:1px solid rgba(23,23,23,.12); padding-top:2mm; }
    .activity-meta-grid span { display:block; font-size:7pt; text-transform:uppercase; letter-spacing:.06em; color:#6b6258; font-weight:700; }
    .activity-meta-grid strong { display:block; margin-top:1mm; font-size:8.5pt; line-height:1.3; }
    .activity-text-block { margin-top:4mm; font-size:9.5pt; line-height:1.55; }
    .activity-text-block h4 { margin:4mm 0 1.5mm; font-size:8pt; text-transform:uppercase; letter-spacing:.06em; }
    .activity-thumbs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:2mm; margin-top:4mm; }
    .activity-thumbs img { width:100%; height:24mm; object-fit:cover; display:block; background:#efefef; }
    .approved-report-card { border:1px solid rgba(23,23,23,.14); background:#fff; padding:5mm; margin-bottom:6mm; }
    .approved-report-card h3 { margin:0 0 2mm; font-size:12pt; font-family: Georgia, "Times New Roman", serif; }
    .approved-report-card header p { margin:0; color:#4d4d4d; font-size:9pt; }
    .report-activity-count { margin-top:4mm; font-size:8.5pt; font-weight:700; }
    .museum-kpi { margin:0 0 4mm; font-size:9pt; color:#4d4d4d; }
  </style>
</head>
<body>
  <main class="activities-report">
    <section class="activities-cover">
      <div>
        <p>Projeto Museus Centro — Viaduto das Artes</p>
        <h1>Relatório de Atividades</h1>
        <p>Relatório integral das atividades e dos relatórios aprovados no aplicativo.</p>
      </div>
      <div>
        <p>Período: ${escapeHtml(periodoLabel)}</p>
        <p>Gerado em: ${escapeHtml(formatDateForReport(generatedAt))}</p>
        <p>Relatórios: ${summary.totalReports || 0} · Atividades: ${summary.totalActivities || 0} · Público: ${summary.totalAudience || 0}</p>
      </div>
    </section>

    <section class="internal-header avoid-break">
      <img src="/viaduto-logo.png" alt="Viaduto das Artes" />
      <div class="txt">
        <div>Viaduto das Artes – Fundado em 16 de junho de 2015</div>
        <div>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</div>
        <div>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</div>
      </div>
    </section>

    <section class="activities-section">
      <h2>Introdução institucional</h2>
      <p>Este Relatório de Atividades reúne, de forma integral, os registros aprovados pelas equipes do Projeto Museus Centro no período consolidado. A publicação reconhece o trabalho cotidiano de profissionais que atuam nos museus, na produção, na comunicação, na mediação, na gestão administrativa, na coordenação e no acompanhamento das ações culturais, educativas e institucionais.</p>
      <p>Mais do que uma listagem operacional, este documento evidencia a dedicação das equipes em manter viva a programação, qualificar o atendimento ao público, organizar informações, produzir registros, acompanhar atividades e sustentar a memória institucional do projeto. Cada relatório aprovado e cada atividade registrada expressam uma dimensão concreta do trabalho coletivo realizado nos equipamentos culturais.</p>
      <p>A organização das informações em formato integral permite preservar a autoria, os contextos, as descrições, os resultados, os desafios e os públicos alcançados. Dessa forma, o relatório fortalece a transparência, a rastreabilidade e o reconhecimento das entregas realizadas nos museus participantes.</p>
      <p><strong>Síntese do ciclo:</strong> ${summary.totalReports || 0} relatórios aprovados, ${summary.totalActivities || 0} atividades registradas, ${summary.totalAudience || 0} pessoas no público consolidado, ${summary.totalMuseums || 0} museus contemplados e ${summary.totalAuthors || 0} profissionais/autores envolvidos.</p>
    </section>

    <section class="activities-section">
      <h2>Sumário executivo</h2>
      <div class="summary-grid">
        <article class="summary-card"><span>Relatórios aprovados</span><strong>${summary.totalReports || 0}</strong></article>
        <article class="summary-card"><span>Atividades consolidadas</span><strong>${summary.totalActivities || 0}</strong></article>
        <article class="summary-card"><span>Público registrado</span><strong>${summary.totalAudience || 0}</strong></article>
        <article class="summary-card"><span>Museus contemplados</span><strong>${summary.totalMuseums || 0}</strong></article>
        <article class="summary-card"><span>Profissionais/autores</span><strong>${summary.totalAuthors || 0}</strong></article>
        <article class="summary-card"><span>Registros com anexos</span><strong>${summary.totalAttachments || 0}</strong></article>
      </div>
    </section>

    <section class="activities-section">
      <h2>Tabela geral de atividades</h2>
      <table class="activities-summary-table">
        <thead>
          <tr><th>Data</th><th>Museu</th><th>Atividade</th><th>Natureza</th><th>Público</th><th>Relatório/Autor</th></tr>
        </thead>
        <tbody>${activitiesTableRows}</tbody>
      </table>
    </section>

    ${museumSections}

    <section class="activities-section">
      <h2>Relatórios aprovados — registros integrais das equipes</h2>
      ${approvedReportsHtml}
    </section>
  </main>
</body>
</html>`;
}

export async function buildActivitiesReport({ museu = 'Todos', periodo = null } = {}) {
  const data = await loadActivitiesReportData({ museu, periodo, forceRefresh: false });
  const htmlRaw = buildActivitiesReportHtml(data, { periodoLabel: periodo ? `${periodo?.[0]} a ${periodo?.[1]}` : '2 de fevereiro a 30 de abril de 2026' });
  const html = removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(repairReportEncoding(htmlRaw)));
  const meta = {
    reportVariant: 'atividades',
    exportMode: 'activities_pdf',
    generatedAt: data.generatedAt,
    sourcePage: '/Relatorios',
    totalReports: data.summary.totalReports,
    totalActivities: data.summary.totalActivities,
    totalAudience: data.summary.totalAudience,
    totalMuseums: data.summary.totalMuseums,
    totalAuthors: data.summary.totalAuthors,
    selectedMuseum: museu,
    period: periodo,
    filename: ACTIVITIES_REPORT_FILENAME,
  };
  return { html, meta, data };
}

export function buildGalleryReportHtml(galleryData = {}, options = {}) {
  const title = options.title || 'Relatório Galeria de Evidências';
  const periodo = options.periodo || '2 de fevereiro a 30 de abril de 2026';
  const generatedAt = options.generatedAt ? new Date(options.generatedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
  const groups = Array.isArray(galleryData?.groups) ? galleryData.groups : [];
  const totalImages = Number(galleryData?.totalImages || 0);
  const imagesByMuseum = galleryData?.imagesByMuseum || {};

  const intro = `
    <p>Este relatório galeria apresenta evidências visuais registradas no aplicativo, organizadas por museu, local, data, legenda e coordenadas, compondo documentação comprobatória das ações culturais, educativas e institucionais do projeto.</p>
  `;

  const sectionHtml = groups.map((group) => `
    <section class="gallery-section gallery-page">
      <header class="gallery-report-header">
        <img src="/viaduto-logo.png" alt="Viaduto das Artes" class="report-pdf-institutional-logo" />
        <div class="gallery-report-header-text">
          <strong>Viaduto das Artes – Fundado em 16 de junho de 2015</strong>
          <span>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</span>
          <span>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</span>
        </div>
      </header>
      <div class="gallery-section-head">
        <h2>${escapeHtml(group.sectionTitle || group.shortTitle || 'Museu')}</h2>
        <p>Total de imagens: ${escapeHtml(String((group.images || []).length))}</p>
        <p>Coordenadas: ${escapeHtml(group.coordinates || 'Não informado')}</p>
      </div>
      <div class="gallery-grid">
        ${(group.images || []).map((image, index) => {
          const fileUrl = String(image?.fileUrl || '');
          const legend = image?.legenda || image?.description || image?.fileName || `Imagem ${index + 1}`;
          const local = image?.localizacao || 'Localização não informada';
          const gps = image?.geoCoordinates || 'GPS não informado';
          const date = image?.date || '';
          const fileName = image?.fileName || '';
          const source = image?.sourceEntity || 'Attachment';
          return `
            <article class="gallery-card">
              <div class="gallery-image-wrap">
                ${fileUrl
                  ? `<img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(legend)}" title="${escapeHtml(legend)}" loading="lazy" decoding="async" fetchpriority="${index < 4 ? 'high' : 'low'}" onerror="this.style.display='none'; this.parentElement.classList.add('image-missing')" />`
                  : `<div class="gallery-image-placeholder">Imagem indisponível</div>`}
              </div>
              <p class="gallery-card-caption">${escapeHtml(legend)}</p>
              <div class="gallery-card-meta">
                <div><strong>Museu:</strong> ${escapeHtml(image?.museu || group.shortTitle || 'Não informado')}</div>
                <div><strong>Data:</strong> ${escapeHtml(date || 'Não informada')}</div>
                <div><strong>Local:</strong> ${escapeHtml(local)}</div>
                <div><strong>Coordenadas:</strong> ${escapeHtml(gps)}</div>
                <div><strong>Arquivo:</strong> ${escapeHtml(fileName || 'Não informado')}</div>
                <div><strong>Origem:</strong> ${escapeHtml(source)}</div>
              </div>
              <p class="gallery-file-name">${escapeHtml(fileName || 'NÃ£o informado')}</p>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm 14mm 10mm; }
    * { box-sizing: border-box; }
    body { background: #f7f3eb; color: #111827; font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .gallery-report { width: 186mm; max-width: 186mm; margin: 0 auto; background: #f7f3eb; color: #171717; font-family: Arial, Helvetica, sans-serif; }
    .gallery-page { page-break-after: always; }
    .report-cover { min-height: 277mm; background: #111827; color: #fff; padding: 18mm 12mm; display: flex; flex-direction: column; justify-content: space-between; }
    .report-cover h1 { font-size: 30pt; line-height: 1.05; margin: 0; }
    .cover-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4mm; margin-top: 8mm; }
    .cover-stats .item { border: 1px solid rgba(255,255,255,.3); padding: 3mm; }
    .cover-stats strong { display: block; font-size: 16pt; }
    .gallery-report-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; border-bottom: 1px solid rgba(23,23,23,.14); padding-bottom: 5mm; margin-bottom: 7mm; }
    .report-pdf-institutional-logo { width: 34mm; height: auto; object-fit: contain; }
    .gallery-report-header-text { flex: 1; text-align: right; font-size: 8pt; line-height: 1.35; color: #555; }
    .gallery-report-header-text span, .gallery-report-header-text strong { display: block; }
    .section-box { background: #fff; border: 1px solid rgba(17,24,39,.14); padding: 5mm; margin-bottom: 7mm; }
    .gallery-section { width: 100%; max-width: 100%; padding: 8mm 0; break-inside: auto; page-break-inside: auto; }
    .gallery-section-head { margin-bottom: 6mm; }
    .gallery-section-head h2 { margin: 0 0 2mm; font-size: 16pt; }
    .gallery-section-head p { margin: 0; font-size: 9pt; color: #4b5563; }
    .gallery-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6mm; width: 100%; max-width: 100%; }
    .gallery-card { width: 100%; max-width: 100%; min-width: 0; border: 1px solid rgba(23,23,23,.14); background: #fff; padding: 4mm; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
    .gallery-card img { width: 100%; height: 54mm; max-height: 54mm; object-fit: cover; display: block; background: #e8e1d8; }
    .gallery-image-placeholder { width: 100%; height: 54mm; max-height: 54mm; display: grid; place-items: center; background: #e8e1d8; color: #6b7280; font-size: 9pt; }
    .gallery-card.image-missing .gallery-image-placeholder { display: grid; }
    .gallery-card-caption { margin-top: 3mm; font-size: 8.8pt; line-height: 1.25; font-weight: 700; color: #171717; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .gallery-card-meta { margin-top: 2mm; font-size: 7.2pt; line-height: 1.25; color: #555; }
    .gallery-card-meta div, .gallery-card-meta p, .gallery-card-meta span { display: block; max-width: 100%; white-space: normal; word-break: normal; overflow-wrap: break-word; }
    .gallery-file-name { font-size: 6.8pt; line-height: 1.2; color: #666; margin-top: 1.5mm; word-break: break-word; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main class="gallery-report">
    <section class="report-cover gallery-page">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Projeto Museus Centro — Viaduto das Artes</p>
        <p>Período: ${escapeHtml(periodo)}</p>
      </div>
      <div class="cover-stats">
        <div class="item"><strong>${escapeHtml(String(totalImages))}</strong><span>Imagens</span></div>
        <div class="item"><strong>${escapeHtml(String(imagesByMuseum.MHAB || 0))}</strong><span>MHAB</span></div>
        <div class="item"><strong>${escapeHtml(String(imagesByMuseum.MIS || 0))}</strong><span>MIS</span></div>
        <div class="item"><strong>${escapeHtml(String(imagesByMuseum.MUMO || 0))}</strong><span>MUMO</span></div>
      </div>
      <p>Fontes: MediaLibrary e Attachment · Gerado em ${escapeHtml(generatedAt)}</p>
    </section>

    <section class="gallery-page gallery-intro">
      <header class="report-pdf-institutional-header">
        <img src="/viaduto-logo.png" alt="Viaduto das Artes" class="report-pdf-institutional-logo" />
        <div class="report-pdf-institutional-text">
          <strong>Viaduto das Artes – Fundado em 16 de junho de 2015</strong>
          <span>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</span>
          <span>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</span>
        </div>
      </header>
      <div class="section-box">
        <h2>Introdução</h2>
        ${intro}
      </div>
      <div class="section-box">
        <h2>Sumário por museu</h2>
        <ul>
          <li>MHAB: ${escapeHtml(String(imagesByMuseum.MHAB || 0))}</li>
          <li>MIS: ${escapeHtml(String(imagesByMuseum.MIS || 0))}</li>
          <li>MUMO: ${escapeHtml(String(imagesByMuseum.MUMO || 0))}</li>
          <li>Sem identificação: ${escapeHtml(String(imagesByMuseum['Sem identificação'] || imagesByMuseum.SEM_IDENTIFICACAO || 0))}</li>
        </ul>
      </div>
    </section>
    ${sectionHtml}
  </main>
</body>
</html>`;
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
  const html = sanitizeReportHtmlBeforeSave(
    removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(repairReportEncoding(result.html)))
  );
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

  const galleryData = await loadGalleryReportData({
    limitMedia: 450,
    limitAttachments: 650,
    useCache: true,
    cacheKey: 'museus_centro_galeria_fotos_cache_v2',
    cacheTtlMs: 10 * 60 * 1000,
  });

  const periodLabel = `${dataResult?.filtros?.dateFrom || '2026-02-02'} a ${dataResult?.filtros?.dateTo || '2026-04-30'}`;
  const galleryInitialHtml = buildGalleryReportHtml(galleryData, {
    title: 'Relatório Galeria de Evidências',
    periodo: periodLabel,
    generatedAt: new Date().toISOString(),
  });
  const galleryOptimizedHtml = await optimizeReportHtmlImages(galleryInitialHtml, {
    ...REPORT_IMAGE_OPTIMIZATION_OPTIONS,
    maxWidth: 900,
    quality: 0.72,
    skipExternalErrors: true,
    preserveAspectRatio: true,
  });
  const galleryHtml = cleanGalleryReportPdfHtml(
    sanitizeReportHtmlBeforeSave(
      removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(repairReportEncoding(galleryOptimizedHtml)))
    )
  );
  const dataHtml = sanitizeReportHtmlBeforeSave(
    removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(stripGalleryImagesFromDataReport(repairReportEncoding(dataResult.html))))
  );

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
      meta: {
        ...buildSingleReportMeta({
        html: galleryHtml,
        selectedChapters: normalizedSections,
        }),
        reportVariant: 'galeria',
        source: 'GaleriaFotos',
        totalImages: Number(galleryData?.totalImages || 0),
        imagesByMuseum: galleryData?.imagesByMuseum || {},
        generatedAt: new Date().toISOString(),
        cacheUsed: Boolean(galleryData?.cacheUsed),
      },
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
      tx.objectStore(PREVIEW_DB_STORE).put(toCloneSafeValue(value), key);
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

function toCloneSafeValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'undefined') return value;

  const type = typeof value;

  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return Number(value);
  if (type === 'function' || type === 'symbol') return undefined;

  if (value instanceof Date) return value.toISOString();
  if (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof File !== 'undefined' && value instanceof File)
  ) return value;
  if (value instanceof RegExp) return String(value);

  if (type === 'object') {
    if (seen.has(value)) return undefined;
    seen.add(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toCloneSafeValue(item, seen))
      .filter((item) => typeof item !== 'undefined');
  }

  if (value instanceof Map) {
    const obj = {};
    value.forEach((item, key) => {
      const safe = toCloneSafeValue(item, seen);
      if (typeof safe !== 'undefined') obj[String(key)] = safe;
    });
    return obj;
  }

  if (value instanceof Set) {
    return Array.from(value)
      .map((item) => toCloneSafeValue(item, seen))
      .filter((item) => typeof item !== 'undefined');
  }

  const plain = {};
  Object.entries(value || {}).forEach(([key, item]) => {
    const safe = toCloneSafeValue(item, seen);
    if (typeof safe !== 'undefined') plain[key] = safe;
  });

  return plain;
}

function shouldStoreHtmlOnlyInIndexedDb(variant, html = '') {
  return variant === 'galeria' || String(html || '').length > 1500000;
}

function clearLargeReportStorageKeys() {
  const keys = [
    'relatorio_fisico_financeiro_html',
    'relatorio_fisico_financeiro_dados_html',
    'relatorio_fisico_financeiro_galeria_html',
    'relatorio_fisico_financeiro_atividades_html',
  ];

  keys.forEach((key) => {
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
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
  const payloadMeta = toCloneSafeValue({
    volumeNumber: Number(volumeNumber) || 1,
    totalVolumes: EXPORT_VOLUME_COUNT,
    pageNumberOffset: 0,
    ...meta,
  });

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
  const finalHtml = sanitizeReportHtmlBeforeSave(
    removeNegativeAndRemovedBlocksFromReport(cleanEmptyReportSections(repairReportEncoding(html)))
  );
  const payloadMeta = {
    ...buildSingleReportMeta({ html: finalHtml, selectedChapters: meta.selectedChapters || [] }),
    ...meta,
    reportType: 'fisico_financeiro',
    exportMode: config.exportMode,
    reportVariant: variant,
  };
  const safeMeta = toCloneSafeValue(payloadMeta);
  const htmlOnlyInIndexedDb = shouldStoreHtmlOnlyInIndexedDb(variant, finalHtml);

  clearLargeReportStorageKeys();

  try {
    if (!htmlOnlyInIndexedDb) {
      sessionStorage.setItem(config.htmlKey, finalHtml);
    }
    sessionStorage.setItem(config.metaKey, JSON.stringify(safeMeta));
    if (variant === 'single') {
      if (!htmlOnlyInIndexedDb) {
        sessionStorage.setItem(SINGLE_REPORT_HTML_KEY, finalHtml);
      }
      sessionStorage.setItem(SINGLE_REPORT_META_KEY, JSON.stringify(safeMeta));
    }
  } catch (error) {
    console.warn('Nao foi possivel salvar previa unica em sessionStorage:', error);
  }

  try {
    if (!htmlOnlyInIndexedDb) {
      localStorage.setItem(config.htmlKey, finalHtml);
    }
    localStorage.setItem(config.metaKey, JSON.stringify(safeMeta));
    localStorage.setItem(`${config.htmlKey}_storage`, htmlOnlyInIndexedDb ? 'indexeddb' : 'storage');
    localStorage.setItem(`${config.htmlKey}_saved_at`, safeMeta.generatedAt || new Date().toISOString());
    if (variant === 'single') {
      if (!htmlOnlyInIndexedDb) {
        localStorage.setItem(SINGLE_REPORT_HTML_KEY, finalHtml);
      }
      localStorage.setItem(SINGLE_REPORT_META_KEY, JSON.stringify(safeMeta));
      localStorage.setItem(`${SINGLE_REPORT_HTML_KEY}_saved_at`, safeMeta.generatedAt || new Date().toISOString());
    }
  } catch (error) {
    console.warn('Nao foi possivel salvar previa unica em localStorage:', error);
  }

  await savePreviewHtmlToIndexedDb(config.htmlKey, {
    html: finalHtml,
    meta: safeMeta,
    savedAt: safeMeta.generatedAt || new Date().toISOString(),
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

  if (variant === 'galeria') {
    html = await getPreviewHtmlFromIndexedDb(config.htmlKey);
  }

  try {
    if (!html) {
      html = sessionStorage.getItem(config.htmlKey) || localStorage.getItem(config.htmlKey) || '';
    }
    meta = JSON.parse(sessionStorage.getItem(config.metaKey) || localStorage.getItem(config.metaKey) || 'null');
  } catch {
    meta = null;
  }

  if (!html) html = await getPreviewHtmlFromIndexedDb(config.htmlKey);
  if (!html && variant === 'single') html = await getPreviewHtmlFromIndexedDb(SINGLE_REPORT_HTML_KEY);

  return {
    html,
    meta: meta || buildSingleReportMeta({ html, reportVariant: variant }),
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
