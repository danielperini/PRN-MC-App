const RUNTIME_FLAG = '__museusCentroReportDialogSizeRuntime';
const STYLE_ID = 'museus-centro-report-dialog-size-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .museus-centro-report-dialog-wide {
      width: min(98vw, 1440px) !important;
      max-width: min(98vw, 1440px) !important;
      max-height: 96vh !important;
      min-height: min(760px, 92vh) !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 30px 34px !important;
    }

    .museus-centro-report-dialog-wide > button[aria-label="Close"],
    .museus-centro-report-dialog-wide > button.absolute {
      top: 18px !important;
      right: 18px !important;
      z-index: 5 !important;
    }

    .museus-centro-report-dialog-wide [data-radix-dialog-header],
    .museus-centro-report-dialog-wide div:has(> h2) {
      max-width: 1120px !important;
    }

    .museus-centro-report-dialog-wide [data-dialog-footer],
    .museus-centro-report-dialog-wide footer,
    .museus-centro-report-dialog-wide .DialogFooter,
    .museus-centro-report-dialog-wide div[class*="DialogFooter"] {
      position: sticky !important;
      bottom: -30px !important;
      z-index: 4 !important;
      margin: 20px -34px -30px !important;
      padding: 16px 34px !important;
      background: rgba(255,255,255,.98) !important;
      border-top: 1px solid rgba(148,163,184,.45) !important;
      box-shadow: 0 -12px 24px rgba(15,23,42,.06) !important;
    }

    .museus-centro-report-dialog-wide .space-y-5,
    .museus-centro-report-dialog-wide .space-y-4 {
      max-width: 100% !important;
    }

    .museus-centro-report-dialog-wide .rounded-xl.border.border-slate-200.bg-white.p-4.space-y-4,
    .museus-centro-report-dialog-wide .rounded-xl.border.border-slate-200.bg-slate-50.p-4.space-y-4 {
      padding: 18px !important;
    }

    .museus-centro-report-dialog-wide .grid.gap-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
    }

    .museus-centro-report-dialog-wide label.flex.items-start,
    .museus-centro-report-dialog-wide .rounded-lg.border.border-slate-200.bg-slate-50 {
      min-height: 72px !important;
    }

    .museus-centro-report-dialog-wide .grid.sm\\:grid-cols-2,
    .museus-centro-report-dialog-wide .grid.md\\:grid-cols-2,
    .museus-centro-report-dialog-wide .grid.lg\\:grid-cols-4 {
      gap: 12px !important;
    }

    @media (min-width: 1180px) {
      .museus-centro-report-dialog-wide .grid.sm\\:grid-cols-2 {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }

      .museus-centro-report-dialog-wide .grid.sm\\:grid-cols-2.lg\\:grid-cols-4 {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
    }

    @media (max-width: 900px) {
      .museus-centro-report-dialog-wide {
        width: 98vw !important;
        max-width: 98vw !important;
        max-height: 96vh !important;
        min-height: 0 !important;
        padding: 18px !important;
      }

      .museus-centro-report-dialog-wide .grid.gap-2,
      .museus-centro-report-dialog-wide .grid.sm\\:grid-cols-2,
      .museus-centro-report-dialog-wide .grid.md\\:grid-cols-2,
      .museus-centro-report-dialog-wide .grid.lg\\:grid-cols-4 {
        grid-template-columns: 1fr !important;
      }

      .museus-centro-report-dialog-wide [data-dialog-footer],
      .museus-centro-report-dialog-wide footer,
      .museus-centro-report-dialog-wide .DialogFooter,
      .museus-centro-report-dialog-wide div[class*="DialogFooter"] {
        margin: 18px -18px -18px !important;
        padding: 14px 18px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function isReportDialog(dialog) {
  const text = String(dialog?.textContent || '');
  return /Escolha os conteudos do relatorio|Escolha os conteúdos do relatório|Capitulos editoriais|Capítulos editoriais|Gerar relatórios/i.test(text);
}

function enhanceDialog(dialog) {
  if (!dialog || !isReportDialog(dialog)) return;
  dialog.classList.add('museus-centro-report-dialog-wide');
  dialog.style.width = 'min(98vw, 1440px)';
  dialog.style.maxWidth = 'min(98vw, 1440px)';
  dialog.style.maxHeight = '96vh';
  dialog.style.minHeight = 'min(760px, 92vh)';
  dialog.style.overflowY = 'auto';
  dialog.style.overflowX = 'hidden';
}

function runPass() {
  if (typeof document === 'undefined') return;
  injectStyle();
  document.querySelectorAll('[role="dialog"]').forEach(enhanceDialog);
}

export function installReportDialogSizeRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;

  runPass();
  const observer = new MutationObserver(runPass);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', runPass, { passive: true });
}

installReportDialogSizeRuntime();
