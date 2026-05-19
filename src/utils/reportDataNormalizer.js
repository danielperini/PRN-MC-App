import { REPORT_EDITORIAL_TEMPLATE } from '@/config/reportEditorialTemplate';
import { validateReportExportWithRegistry } from '@/config/reportChapters';
import {
  extractPhotos,
  prepareInlineAndGalleryPhotos,
  toNumber,
} from '@/components/reports/premium/premiumReportUtils';
import { normalizeHtmlForReport, normalizeTextForReport } from './reportTextHelpers';
import { validateReportLayoutHtml } from './reportLayoutRules';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRecordStrings(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === 'string' ? normalizeTextForReport(value) : value,
    ])
  );
}

function normalizeIdentityText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[:;,.!?()[\]{}\-–—_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDateToDay(value = '') {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function getStrictActivityIdentity(item = {}) {
  const id = item.id || item._id || item.activity_id || item.atividade_id || item.programacao_id;
  if (id) return `id:${id}`;

  const title = normalizeIdentityText(item.titulo || item.title || item.nome || item.nome_atividade);
  const day = normalizeDateToDay(item.data || item.date || item.data_inicio);
  const museum = normalizeIdentityText(item.museu || item.centro || item.equipamento || item.centro_custo || item.local);

  return title && day && museum ? `strict:${day}:${museum}:${title}` : '';
}

function dedupeActivitiesByStrictIdentity(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of Array.isArray(items) ? items : []) {
    const identity = getStrictActivityIdentity(item);

    if (!identity) {
      result.push(item);
      continue;
    }

    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }

  return result;
}

export function getReportPeriodLabel(contexto = {}, selectedPeriod = {}) {
  return normalizeTextForReport(
    contexto.periodo_extenso ||
    selectedPeriod.periodo_extenso ||
    selectedPeriod.label ||
    [selectedPeriod.dateFrom, selectedPeriod.dateTo].filter(Boolean).join(' a ') ||
    [contexto.dateFrom, contexto.dateTo].filter(Boolean).join(' a ') ||
    'recorte selecionado'
  );
}

export function validateReportIndicators(reportContext = {}) {
  const publicoPorMes = safeArray(reportContext.publico_por_mes);
  const publicoPorMuseu = Array.isArray(reportContext.publico_por_museu)
    ? reportContext.publico_por_museu
    : Object.values(reportContext.por_museu || {});

  const totalPorMes = publicoPorMes.reduce((sum, item) => sum + toNumber(item.total), 0);
  const totalPorMuseu = publicoPorMuseu.reduce((sum, item) => sum + toNumber(item.total ?? item.publico), 0);
  const warnings = [];

  if (totalPorMes > 0 && totalPorMuseu > 0 && totalPorMes !== totalPorMuseu) {
    warnings.push({
      code: 'PUBLICO_UNIVERSOS_DIFERENTES',
      message: 'Público por mês e público por museu possuem universos diferentes e devem receber nota metodológica.',
      totals: {
        publicoAtividadesDatadas: totalPorMes,
        publicoConsolidadoMuseus: totalPorMuseu,
      },
    });
  }

  return {
    valid: true,
    warnings,
    totals: {
      publicoAtividadesDatadas: totalPorMes,
      publicoConsolidadoMuseus: totalPorMuseu,
    },
  };
}

export function buildEditorialReportContext(rawData = {}, selectedPeriod = {}, selectedChapters = []) {
  const atividades = safeArray(rawData.atividades).map(normalizeRecordStrings);
  const activities = safeArray(rawData.activities).map(normalizeRecordStrings);
  const programacao = safeArray(rawData.programacao).map(normalizeRecordStrings);
  const programacoes = safeArray(rawData.programacoes).map(normalizeRecordStrings);
  const atividadesConsolidadas = dedupeActivitiesByStrictIdentity([...atividades, ...activities]);
  const programacaoConsolidada = dedupeActivitiesByStrictIdentity([...programacao, ...programacoes]);

  const contexto = {
    ...rawData,
    atividades,
    activities,
    programacao,
    programacoes,
    programacao_consolidada: programacaoConsolidada,
    atividades_consolidadas: atividadesConsolidadas,
    total_atividades: rawData.total_atividades ?? atividadesConsolidadas.length,
  };

  const allPhotos = extractPhotos(contexto);
  const { galleryPhotos, inlinePhotos } = prepareInlineAndGalleryPhotos(
    allPhotos,
    rawData.selected_inline_photo_ids || []
  );
  const indicatorValidation = validateReportIndicators(contexto);

  return {
    ...contexto,
    report_editorial_template: REPORT_EDITORIAL_TEMPLATE,
    reportEditorial: {
      template: REPORT_EDITORIAL_TEMPLATE,
      periodLabel: getReportPeriodLabel(contexto, selectedPeriod),
      selectedChapters: safeArray(selectedChapters),
      indicatorValidation,
      inlinePhotoCount: inlinePhotos.length,
      galleryPhotoCount: galleryPhotos.length,
      activityNatureCounts: atividadesConsolidadas.reduce((acc, item) => {
        const key = item.activityNature || 'NAO_CLASSIFICADA';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

export function validateReportBeforeExport(reportContext = {}, html = '', selectedChapters = []) {
  const normalizedHtml = normalizeHtmlForReport(html);
  const registryValidation = validateReportExportWithRegistry(normalizedHtml, selectedChapters);
  const layoutValidation = validateReportLayoutHtml(normalizedHtml);
  const indicatorValidation = validateReportIndicators(reportContext);
  const errors = [];

  if (!normalizedHtml.trim()) {
    errors.push('HTML do relatorio vazio.');
  } else if (
    !normalizedHtml.includes('premium-report') &&
    !normalizedHtml.includes('report-export') &&
    !normalizedHtml.includes('report-pdf-institutional-header')
  ) {
    errors.push('Container principal do relatorio nao encontrado.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [
      ...(registryValidation.valid ? [] : registryValidation.missingSelected.map((chapterId) => `Capitulo selecionado nao renderizado: ${chapterId}`)),
      ...layoutValidation.errors,
      ...layoutValidation.warnings,
      ...indicatorValidation.warnings.map((item) => item.message),
    ],
    registryValidation,
    layoutValidation,
    indicatorValidation,
  };
}
