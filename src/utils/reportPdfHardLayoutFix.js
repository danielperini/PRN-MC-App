const REPORT_HARD_STYLE_ID = 'museus-centro-report-pdf-hard-layout-fix';

const REPORT_HARD_CSS = `
@page { size: A4; margin: 10mm 8mm 12mm 8mm; }
html, body {
  overflow-x: hidden !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.premium-report, main.premium-report, .report-shell {
  width: 794px !important;
  min-width: 794px !important;
  max-width: 794px !important;
  margin: 0 auto !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}
.premium-report *, .report-shell * {
  box-sizing: border-box !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  white-space: normal !important;
  hyphens: none !important;
}
.premium-section, .premium-museum-block, .premium-communication, .premium-closing,
.premium-expediente, .premium-month-grid, .premium-activity-grid, .premium-report-archive,
section, article {
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.premium-activity-grid, .premium-month-grid, .premium-report-archive {
  display: block !important;
}
.premium-activity-card, .premium-month-card, .premium-report-card,
.premium-meta-card, .premium-infographic-card {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
  clear: both !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
.premium-activity-card > *, .premium-activity-card article, .premium-activity-card div,
.premium-activity-card header, .premium-activity-card main, .premium-activity-card footer,
.activity-card-meta, .activity-card-title, .activity-card-body,
.premium-card-header, .premium-card-facts, .premium-card-footer {
  display: block !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.premium-activity-index, .premium-activity-number, .premium-card-index {
  display: inline-block !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  margin-right: 8px !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
.premium-activity-card h1, .premium-activity-card h2, .premium-activity-card h3,
.premium-activity-card h4, .premium-activity-card p,
.premium-month-card h1, .premium-month-card h2, .premium-month-card h3, .premium-month-card p,
.premium-card-header *, .premium-card-facts *, .premium-card-footer * {
  width: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
  white-space: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  line-height: 1.35 !important;
}
table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: auto !important;
  border-collapse: collapse !important;
}
th, td {
  min-width: 52px !important;
  max-width: none !important;
  white-space: normal !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
  vertical-align: top !important;
}
th:first-child, td:first-child { min-width: 130px !important; }
.premium-internal-page-header, .report-pdf-institutional-header {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 18px !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
}
.premium-internal-page-header-logo, .report-pdf-institutional-logo-wrap {
  display: block !important;
  width: 128px !important;
  min-width: 128px !important;
  max-width: 128px !important;
  height: 68px !important;
  flex: 0 0 128px !important;
  background-image: url('/viaduto-logo.png') !important;
  background-repeat: no-repeat !important;
  background-position: left center !important;
  background-size: contain !important;
}
.premium-internal-page-header-logo img, .report-pdf-institutional-logo {
  max-width: 128px !important;
  max-height: 68px !important;
  object-fit: contain !important;
}
.premium-internal-page-header-text, .report-pdf-institutional-text {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  max-width: calc(100% - 150px) !important;
  text-align: right !important;
}
@media print {
  .premium-report, main.premium-report, .report-shell {
    width: 794px !important;
    min-width: 794px !important;
    max-width: 794px !important;
  }
  .premium-activity-card, .premium-month-card, tr, figure {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`;

function hasReportMarkup(doc) {
  return Boolean(doc?.querySelector?.('.premium-report, main.premium-report, .report-shell, .premium-activity-card, .premium-month-card'));
}

function injectStyle(doc) {
  try {
    if (!doc?.head || !hasReportMarkup(doc)) return false;
    let style = doc.getElementById(REPORT_HARD_STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = REPORT_HARD_STYLE_ID;
      doc.head.appendChild(style);
    }
    if (style.textContent !== REPORT_HARD_CSS) style.textContent = REPORT_HARD_CSS;
    return true;
  } catch {
    return false;
  }
}

function scan() {
  injectStyle(document);
  document.querySelectorAll('iframe').forEach((iframe) => {
    try { injectStyle(iframe.contentDocument); } catch {}
  });
}

export function installReportPdfHardLayoutFix() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timer = window.setInterval(scan, 200);
    window.setTimeout(() => window.clearInterval(timer), 180000);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

installReportPdfHardLayoutFix();
