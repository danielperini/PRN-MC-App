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
export const PREVIEW_DB_NAME = 'museus_centro_report_preview';
export const PREVIEW_DB_STORE = 'previews';

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

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade do relatorio:', error);
    return [];
  }
}

async function carregarBaseConhecimento() {
  const candidatos = [
    base44?.entities?.BaseConhecimento,
    base44?.entities?.KnowledgeBase,
    base44?.entities?.KnowledgeItem,
    base44?.entities?.ProjectKnowledge,
  ].filter(Boolean);

  for (const entity of candidatos) {
    const lista = await safeList(entity, '-updated_date', 500);
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

  const [
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
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 2000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000),
    safeList(base44.entities.PurchaseRequest, '-created_date', 2000),
    safeList(base44.entities.TeamPayment, '-created_date', 2000),
    safeList(base44.entities.DocumentIntake, '-created_date', 2000),
    safeList(base44.entities.Attachment, '-created_date', 3000),
    safeList(base44.entities.Gallery, '-created_date', 3000),
    safeList(base44.entities.Meta, 'codigo', 1000),
    safeList(base44.entities.PresenceRecord, '-data', 3000),
    safeList(base44.entities.Programacao, '-data_inicio', 3000),
    carregarBaseConhecimento(),
  ]);

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
        gallery: galleryRaw.length,
        presenceRecords: presenceRecordsRaw.length,
      },
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
    const doc = parser.parseFromString(String(html), 'text/html');

    doc.querySelectorAll('.empty-section, section, article').forEach((node) => {
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

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch (error) {
    console.warn('Falha ao limpar secoes vazias do relatorio:', error);
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
  const html = cleanEmptyReportSections(htmlOtimizado);

  return { html, contexto };
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
