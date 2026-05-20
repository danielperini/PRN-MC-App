const REPORT_HTML_KEY_PATTERNS = [
  'relatorio_fisico_financeiro_html',
  'relatorio_fisico_financeiro_dados_html',
  'relatorio_fisico_financeiro_galeria_html',
  'relatorio_fisico_financeiro_volume_',
];

const REPORT_FIX_STYLE_ID = 'museus-centro-report-layout-fixes';

const REPORT_FIX_CSS = `
  .premium-report,
  .premium-report * {
    word-break: normal !important;
    overflow-wrap: break-word !important;
    hyphens: auto !important;
  }

  .premium-report {
    width: 210mm !important;
    max-width: 210mm !important;
    min-width: 210mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    overflow-x: hidden !important;
  }

  .premium-section,
  .premium-museum-block,
  .premium-communication,
  .premium-closing,
  .premium-expediente {
    width: 210mm !important;
    max-width: 210mm !important;
    min-width: 210mm !important;
    overflow: visible !important;
  }

  .premium-internal-page-header {
    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 18px !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  .premium-internal-page-header-logo {
    width: 34mm !important;
    min-width: 34mm !important;
    height: 18mm !important;
    flex: 0 0 34mm !important;
    background-image: url('/viaduto-logo.png') !important;
    background-repeat: no-repeat !important;
    background-position: left center !important;
    background-size: contain !important;
  }

  .premium-internal-page-header-logo img {
    max-width: 34mm !important;
    max-height: 18mm !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain !important;
  }

  .premium-internal-page-header-logo img[src=''],
  .premium-internal-page-header-logo img:not([src]) {
    display: none !important;
  }

  .premium-internal-page-header-text {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    text-align: right !important;
    white-space: normal !important;
  }

  .report-pdf-institutional-logo-wrap {
    width: 28mm !important;
    min-width: 28mm !important;
    height: 16mm !important;
    flex: 0 0 28mm !important;
    background-image: url('/viaduto-logo.png') !important;
    background-repeat: no-repeat !important;
    background-position: left center !important;
    background-size: contain !important;
  }

  .report-pdf-institutional-logo {
    max-width: 28mm !important;
    max-height: 16mm !important;
    object-fit: contain !important;
  }

  .premium-activity-grid,
  .premium-month-grid,
  .premium-report-archive,
  .premium-museum-block,
  .premium-section {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  .premium-activity-card {
    display: grid !important;
    grid-template-columns: 40px minmax(0, 1fr) !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: visible !important;
    align-items: start !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .premium-activity-card > *,
  .premium-activity-card article,
  .premium-activity-card div,
  .activity-card-meta,
  .activity-card-title,
  .activity-card-body,
  .premium-activity-card h3,
  .premium-activity-card h4,
  .premium-activity-card p,
  .premium-month-card h3,
  .premium-month-card p,
  .premium-card-header,
  .premium-card-header *,
  .premium-card-facts,
  .premium-card-facts *,
  .premium-card-footer,
  .premium-card-footer * {
    min-width: 0 !important;
    max-width: 100% !important;
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
  }

  .premium-activity-index {
    width: 40px !important;
    min-width: 40px !important;
    max-width: 40px !important;
    white-space: normal !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
    text-align: left !important;
  }

  .premium-month-card,
  .premium-card-header,
  .premium-card-facts,
  .premium-card-footer {
    min-width: 0 !important;
    max-width: 100% !important;
  }

  @media print {
    .premium-report {
      width: 210mm !important;
      max-width: 210mm !important;
      min-width: 210mm !important;
      margin: 0 auto !important;
    }

    .premium-section,
    .premium-museum-block,
    .premium-communication,
    .premium-closing,
    .premium-expediente {
      width: 210mm !important;
      max-width: 210mm !important;
      min-width: 210mm !important;
      overflow: visible !important;
    }

    .premium-activity-card {
      grid-template-columns: 40px minmax(0, 1fr) !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  }
`;

function isReportHtmlKey(key) {
  const normalizedKey = String(key || '');
  return REPORT_HTML_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern)) && normalizedKey.endsWith('_html');
}

function looksLikeReportHtml(value) {
  const html = String(value || '');
  return html.includes('premium-report') || html.includes('Relat') || html.includes('Museus Centro');
}

export function injectReportLayoutFixes(html = '') {
  const source = String(html || '');
  if (!source || !looksLikeReportHtml(source)) return source;
  if (source.includes(REPORT_FIX_STYLE_ID)) return source;

  const styleTag = `<style id="${REPORT_FIX_STYLE_ID}">${REPORT_FIX_CSS}</style>`;
  const logoPreload = `<link rel="preload" as="image" href="/viaduto-logo.png" data-report-logo-preload="true">`;

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${logoPreload}\n${styleTag}\n</head>`);
  }

  if (/<html[^>]*>/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${logoPreload}${styleTag}</head>`);
  }

  return `<!doctype html><html lang="pt-BR"><head>${logoPreload}${styleTag}</head><body>${source}</body></html>`;
}

function patchStorageGetItem(StoragePrototype) {
  const originalGetItem = StoragePrototype.getItem;
  if (originalGetItem.__reportLayoutFixPatched) return;

  function patchedGetItem(key) {
    const value = originalGetItem.call(this, key);
    if (typeof value !== 'string' || !isReportHtmlKey(key)) return value;
    return injectReportLayoutFixes(value);
  }

  patchedGetItem.__reportLayoutFixPatched = true;
  patchedGetItem.__originalGetItem = originalGetItem;
  StoragePrototype.getItem = patchedGetItem;
}

function patchStorageSetItem(StoragePrototype) {
  const originalSetItem = StoragePrototype.setItem;
  if (originalSetItem.__reportLayoutFixPatched) return;

  function patchedSetItem(key, value) {
    if (typeof value === 'string' && isReportHtmlKey(key)) {
      return originalSetItem.call(this, key, injectReportLayoutFixes(value));
    }
    return originalSetItem.call(this, key, value);
  }

  patchedSetItem.__reportLayoutFixPatched = true;
  patchedSetItem.__originalSetItem = originalSetItem;
  StoragePrototype.setItem = patchedSetItem;
}

export function installReportHtmlRuntimeFixes() {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;

  try {
    patchStorageGetItem(Storage.prototype);
    patchStorageSetItem(Storage.prototype);
  } catch (error) {
    console.warn('[Relatorio] Não foi possível instalar correções runtime do HTML:', error);
  }
}

installReportHtmlRuntimeFixes();
