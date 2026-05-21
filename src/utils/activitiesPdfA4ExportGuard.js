const PATCH_FLAG = '__museusCentroActivitiesPdfA4ExportGuard';

function isActivitiesReportHtml(value = '') {
  const html = String(value || '');
  return html.includes('Relatório de Atividades') ||
    html.includes('Relatorio de Atividades') ||
    html.includes('activities-report') ||
    html.includes('activity-full-card') ||
    html.includes('approved-report-card');
}

function normalizeActivitiesPdfHtml(value = '') {
  let html = String(value || '');
  if (!isActivitiesReportHtml(html)) return html;

  // O exportador PDF de RelatorioPreview escolhe alvos por classes premium.
  // O relatório de atividades é muito longo e, quando fica como um único body/main,
  // dispara a trava: "elementos fora da escala A4". Esta normalização converte
  // o HTML de atividades em blocos reconhecidos e quebráveis, sem alterar dados.
  html = html
    .replace(/class=(['"])([^'"]*\bactivities-report\b(?![^'"]*\bpremium-report\b)[^'"]*)\1/g, 'class=$1$2 premium-report$1')
    .replace(/class=(['"])([^'"]*\bactivities-cover\b(?![^'"]*\bpremium-cover\b)[^'"]*)\1/g, 'class=$1$2 premium-cover$1')
    .replace(/class=(['"])([^'"]*\bactivities-section\b(?![^'"]*\bpremium-section\b)[^'"]*)\1/g, 'class=$1$2 premium-section$1')
    .replace(/class=(['"])([^'"]*\bactivity-full-card\b(?![^'"]*\bpremium-activity-card\b)[^'"]*)\1/g, 'class=$1$2 premium-activity-card$1')
    .replace(/class=(['"])([^'"]*\bapproved-report-card\b(?![^'"]*\bpremium-report-note\b)[^'"]*)\1/g, 'class=$1$2 premium-report-note$1');

  const injectedCss = `
<style id="activities-pdf-a4-export-guard">
  main.activities-report.premium-report,
  .activities-report.premium-report {
    width: 794px !important;
    min-width: 794px !important;
    max-width: 794px !important;
    margin: 0 auto !important;
    overflow: visible !important;
    background: #f7f3eb !important;
    transform: none !important;
  }

  .activities-cover.premium-cover {
    width: 794px !important;
    height: 1123px !important;
    min-height: 1123px !important;
    max-height: 1123px !important;
    padding: 84px 68px !important;
    overflow: hidden !important;
    break-after: auto !important;
    page-break-after: auto !important;
  }

  .activities-section.premium-section {
    width: 794px !important;
    max-width: 794px !important;
    min-height: auto !important;
    height: auto !important;
    padding: 54px 57px 54px !important;
    margin: 0 !important;
    overflow: visible !important;
    transform: none !important;
    break-after: auto !important;
    page-break-after: auto !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }

  .activity-full-card.premium-activity-card,
  .approved-report-card.premium-report-note {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: auto !important;
    overflow: visible !important;
    transform: none !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin-bottom: 18px !important;
  }

  .activity-full-card *,
  .approved-report-card *,
  .activities-section *,
  .activities-summary-table *,
  .evidence-file-list * {
    max-width: 100% !important;
    min-width: 0 !important;
    white-space: normal !important;
    writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
    transform: none !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
  }

  .activities-summary-cards,
  .activity-meta-grid {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  .activities-summary-table,
  .activities-summary-table table,
  table.activities-summary-table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }

  .activities-summary-table th,
  .activities-summary-table td {
    word-break: normal !important;
    overflow-wrap: break-word !important;
    white-space: normal !important;
  }
</style>`;

  if (!html.includes('activities-pdf-a4-export-guard')) {
    html = html.includes('</head>')
      ? html.replace('</head>', `${injectedCss}</head>`)
      : `${injectedCss}${html}`;
  }

  return html;
}

function patchDocumentWrite() {
  if (typeof Document === 'undefined') return;
  if (Document.prototype.__activitiesPdfA4WritePatched) return;
  Document.prototype.__activitiesPdfA4WritePatched = true;

  const originalWrite = Document.prototype.write;
  Document.prototype.write = function patchedWrite(...args) {
    return originalWrite.apply(
      this,
      args.map((arg) => (typeof arg === 'string' ? normalizeActivitiesPdfHtml(arg) : arg)),
    );
  };
}

function patchStorage() {
  if (typeof Storage === 'undefined') return;
  if (Storage.prototype.__activitiesPdfA4StoragePatched) return;
  Storage.prototype.__activitiesPdfA4StoragePatched = true;

  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_atividades_html' && typeof value === 'string';
    return originalSetItem.call(this, key, shouldNormalize ? normalizeActivitiesPdfHtml(value) : value);
  };

  Storage.prototype.getItem = function patchedGetItem(key) {
    const value = originalGetItem.call(this, key);
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_atividades_html' && typeof value === 'string';
    return shouldNormalize ? normalizeActivitiesPdfHtml(value) : value;
  };
}

function patchIndexedDbPutGet() {
  if (typeof IDBObjectStore === 'undefined') return;
  if (IDBObjectStore.prototype.__activitiesPdfA4IdbPatched) return;
  IDBObjectStore.prototype.__activitiesPdfA4IdbPatched = true;

  const originalPut = IDBObjectStore.prototype.put;
  const originalGet = IDBObjectStore.prototype.get;

  IDBObjectStore.prototype.put = function patchedPut(value, key) {
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_atividades_html';
    if (shouldNormalize && value && typeof value === 'object' && typeof value.html === 'string') {
      return originalPut.call(this, { ...value, html: normalizeActivitiesPdfHtml(value.html) }, key);
    }
    if (shouldNormalize && typeof value === 'string') {
      return originalPut.call(this, normalizeActivitiesPdfHtml(value), key);
    }
    return originalPut.call(this, value, key);
  };

  IDBObjectStore.prototype.get = function patchedGet(key) {
    const request = originalGet.call(this, key);
    const shouldNormalize = String(key || '') === 'relatorio_fisico_financeiro_atividades_html';
    if (!shouldNormalize) return request;

    request.addEventListener('success', () => {
      const value = request.result;
      if (value && typeof value === 'object' && typeof value.html === 'string') {
        value.html = normalizeActivitiesPdfHtml(value.html);
      }
    });
    return request;
  };
}

export function installActivitiesPdfA4ExportGuard() {
  if (typeof window === 'undefined') return;
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  patchDocumentWrite();
  patchStorage();
  patchIndexedDbPutGet();
}

installActivitiesPdfA4ExportGuard();
