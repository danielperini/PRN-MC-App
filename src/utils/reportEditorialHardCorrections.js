const FLAG = '__museusCentroReportEditorialHardCorrections';
const STYLE_ID = 'museus-centro-report-editorial-hard-corrections';

const CSS = `
  .premium-section[data-chapter-id="atividades_museu"],
  .premium-museum-block[data-chapter-id="atividades_museu"],
  section[data-chapter-id="atividades_museu"],
  .report-negative-alerts,
  .premium-alert-list,
  .premium-alert-list li,
  .premium-method-card:has(strong:nth-child(1):contains("Pendências")) { display: none !important; }

  .premium-section:has(h2:contains("Atividades por museu")),
  .premium-section:has(h2:contains("Síntese, alertas")),
  .premium-section:has(strong:contains("Alertas de consistência")),
  .premium-method-card:has(strong:contains("Alertas")),
  .premium-method-card:has(strong:contains("Pendências")) { display: none !important; }

  .budget-table,
  table.budget-table {
    width: 100% !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    table-layout: fixed !important;
    border: 1px solid rgba(23,23,23,.14) !important;
    background: #fff !important;
    font-size: 8.7pt !important;
    line-height: 1.28 !important;
  }
  .budget-table th,
  .budget-table td {
    padding: 7px 7px !important;
    vertical-align: middle !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
    hyphens: none !important;
  }
  .budget-table th {
    background: #171717 !important;
    color: #fff !important;
    font-size: 7.2pt !important;
    line-height: 1.15 !important;
    letter-spacing: .04em !important;
  }
  .budget-table td:nth-child(2),
  .budget-table td:nth-child(3),
  .budget-table td:nth-child(4),
  .budget-table td:nth-child(5),
  .budget-table td:nth-child(6),
  .budget-table td:nth-child(7) {
    text-align: right !important;
    font-variant-numeric: tabular-nums !important;
    white-space: nowrap !important;
  }
  .budget-table th:nth-child(1), .budget-table td:nth-child(1) { width: 13% !important; }
  .budget-table th:nth-child(2), .budget-table td:nth-child(2) { width: 16% !important; }
  .budget-table th:nth-child(3), .budget-table td:nth-child(3) { width: 16% !important; }
  .budget-table th:nth-child(4), .budget-table td:nth-child(4) { width: 16% !important; }
  .budget-table th:nth-child(5), .budget-table td:nth-child(5) { width: 11% !important; }
  .budget-table th:nth-child(6), .budget-table td:nth-child(6) { width: 14% !important; }
  .budget-table th:nth-child(7), .budget-table td:nth-child(7) { width: 14% !important; }

  .premium-finance-summary-cards {
    grid-template-columns: repeat(3, minmax(0,1fr)) !important;
  }
  .premium-finance-summary-card:first-child strong:empty::after,
  .premium-finance-summary-card strong:contains("R$ 0,00")::after { content: ""; }

  .premium-internal-page-header-logo,
  .report-pdf-institutional-logo-wrap {
    background-image: url('/viaduto-logo.png') !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: left center !important;
  }
  .premium-internal-page-header-logo img,
  .report-pdf-institutional-logo {
    content: url('/viaduto-logo.png') !important;
    width: 34mm !important;
    max-width: 34mm !important;
    height: auto !important;
    object-fit: contain !important;
  }
`;

function removeNegativeSections(doc) {
  if (!doc?.querySelectorAll) return;
  const patterns = [
    /atividades\s+por\s+museu/i,
    /alertas\s+de\s+consist/i,
    /s[ií]ntese,?\s+alertas\s+e\s+governan/i,
    /alertas\s+principais/i,
    /pend[eê]ncias\s+e\s+limita/i,
  ];
  doc.querySelectorAll('section, article, .premium-section, .premium-method-card, .premium-infographic-card').forEach((node) => {
    const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    if (patterns.some((pattern) => pattern.test(text.slice(0, 260)))) node.remove();
  });
}

function injectStyle(doc) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function fixDocument(doc = document) {
  injectStyle(doc);
  removeNegativeSections(doc);
}

function fixHtml(html = '') {
  const source = String(html || '');
  if (!source.includes('premium-report') && !source.includes('Relatório')) return source;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    fixDocument(doc);
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  } catch {
    return source;
  }
}

export function installReportEditorialHardCorrections() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[FLAG]) return;
  window[FLAG] = true;

  const originalWrite = Document.prototype.write;
  if (!Document.prototype.__mcEditorialWritePatched) {
    Document.prototype.__mcEditorialWritePatched = true;
    Document.prototype.write = function patchedWrite(...args) {
      return originalWrite.apply(this, args.map((arg) => typeof arg === 'string' ? fixHtml(arg) : arg));
    };
  }

  const patchStorage = (StorageCtor) => {
    if (!StorageCtor?.prototype || StorageCtor.prototype.__mcEditorialStoragePatched) return;
    StorageCtor.prototype.__mcEditorialStoragePatched = true;
    const originalSetItem = StorageCtor.prototype.setItem;
    const originalGetItem = StorageCtor.prototype.getItem;
    StorageCtor.prototype.setItem = function setItem(key, value) {
      const shouldFix = String(key || '').startsWith('relatorio_fisico_financeiro_') && typeof value === 'string';
      return originalSetItem.call(this, key, shouldFix ? fixHtml(value) : value);
    };
    StorageCtor.prototype.getItem = function getItem(key) {
      const value = originalGetItem.call(this, key);
      const shouldFix = String(key || '').startsWith('relatorio_fisico_financeiro_') && typeof value === 'string';
      return shouldFix ? fixHtml(value) : value;
    };
  };

  patchStorage(window.Storage);

  const run = () => {
    fixDocument(document);
    document.querySelectorAll('iframe').forEach((iframe) => {
      try { fixDocument(iframe.contentDocument); } catch {}
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
}

installReportEditorialHardCorrections();
