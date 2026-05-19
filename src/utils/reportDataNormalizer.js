import { REPORT_EDITORIAL_TEMPLATE } from '@/config/reportEditorialTemplate';
import { validateReportExportWithRegistry } from '@/config/reportChapters';
import {
  dedupeReportActivities,
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
  const atividades = dedupeReportActivities(safeArray(rawData.atividades).map(normalizeRecordStrings));
  const activities = dedupeReportActivities(safeArray(rawData.activities).map(normalizeRecordStrings));
  const programacao = dedupeReportActivities(safeArray(rawData.programacao).map(normalizeRecordStrings));
  const programacoes = dedupeReportActivities(safeArray(rawData.programacoes).map(normalizeRecordStrings));
  const atividadesConsolidadas = dedupeReportActivities([...atividades, ...activities, ...programacao, ...programacoes]);

  const contexto = {
    ...rawData,
    atividades,
    activities,
    programacao,
    programacoes,
    atividades_consolidadas: atividadesConsolidadas,
    total_atividades_bruto: rawData.total_atividades,
    total_atividades: atividadesConsolidadas.length || rawData.total_atividades,
  };

  const allPhotos = extractPhotos(contexto, 500);
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
  const errors = [
    ...(registryValidation.valid ? [] : registryValidation.missingSelected.map((chapterId) => `Capítulo selecionado não renderizado: ${chapterId}`)),
    ...layoutValidation.errors,
  ];

  return {
    valid: errors.length === 0,
    errors,
    warnings: [
      ...layoutValidation.warnings,
      ...indicatorValidation.warnings.map((item) => item.message),
    ],
    registryValidation,
    layoutValidation,
    indicatorValidation,
  };
}
