const RUNTIME_FLAG = '__museusCentroReportDialogSizeRuntime';
const STYLE_ID = 'museus-centro-report-dialog-size-style';

function injectStyle() {
  if (typeof document === 'undefined') return;

  const previous = document.getElementById(STYLE_ID);
  if (previous) previous.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .museus-centro-report-dialog-wide {
      width: min(98vw, 1360px) !important;
      max-width: min(98vw, 1360px) !important;
      max-height: 94vh !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 28px 32px !important;
      pointer-events: auto !important;
    }

    .museus-centro-report-dialog-wide button,
    .museus-centro-report-dialog-wide input,
    .museus-centro-report-dialog-wide select,
    .museus-centro-report-dialog-wide textarea,
    .museus-centro-report-dialog-wide [role="checkbox"],
    .museus-centro-report-dialog-wide [role="combobox"] {
      pointer-events: auto !important;
    }

    .museus-centro-report-dialog-wide .rounded-xl.border.border-slate-200.bg-white.p-4.space-y-4,
    .museus-centro-report-dialog-wide .rounded-xl.border.border-slate-200.bg-slate-50.p-4.space-y-4 {
      padding: 18px !important;
    }

    .museus-centro-report-dialog-wide .grid.gap-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 10px !important;
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
        max-height: 94vh !important;
        padding: 18px !important;
      }

      .museus-centro-report-dialog-wide .grid.gap-2,
      .museus-centro-report-dialog-wide .grid.sm\\:grid-cols-2,
      .museus-centro-report-dialog-wide .grid.md\\:grid-cols-2,
      .museus-centro-report-dialog-wide .grid.lg\\:grid-cols-4 {
        grid-template-columns: 1fr !important;
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
  dialog.style.width = 'min(98vw, 1360px)';
  dialog.style.maxWidth = 'min(98vw, 1360px)';
  dialog.style.maxHeight = '94vh';
  dialog.style.overflowY = 'auto';
  dialog.style.overflowX = 'hidden';
  dialog.style.pointerEvents = 'auto';
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
