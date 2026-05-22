const RUNTIME_FLAG = '__museusCentroReportDialogSizeRuntime';
const STYLE_ID = 'museus-centro-report-dialog-size-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .museus-centro-report-dialog-wide {
      width: min(96vw, 1280px) !important;
      max-width: min(96vw, 1280px) !important;
      max-height: 94vh !important;
      height: auto !important;
      overflow-y: auto !important;
      padding: 28px !important;
    }

    .museus-centro-report-dialog-wide [data-dialog-footer],
    .museus-centro-report-dialog-wide footer,
    .museus-centro-report-dialog-wide .DialogFooter {
      position: sticky;
      bottom: -28px;
      z-index: 2;
      margin: 18px -28px -28px;
      padding: 16px 28px;
      background: rgba(255,255,255,.98);
      border-top: 1px solid rgba(148,163,184,.45);
    }

    .museus-centro-report-dialog-wide .rounded-xl.border.border-slate-200.bg-white.p-4.space-y-4 {
      padding: 18px !important;
    }

    .museus-centro-report-dialog-wide .grid.gap-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px !important;
    }

    @media (max-width: 900px) {
      .museus-centro-report-dialog-wide {
        width: 96vw !important;
        max-width: 96vw !important;
        max-height: 94vh !important;
        padding: 18px !important;
      }

      .museus-centro-report-dialog-wide .grid.gap-2 {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function isReportDialog(dialog) {
  const text = String(dialog?.textContent || '');
  return /Escolha os conteudos do relatorio|Escolha os conteúdos do relatório|Capitulos editoriais|Capítulos editoriais/i.test(text);
}

function enhanceDialog(dialog) {
  if (!dialog || !isReportDialog(dialog)) return;
  dialog.classList.add('museus-centro-report-dialog-wide');
  dialog.style.width = 'min(96vw, 1280px)';
  dialog.style.maxWidth = 'min(96vw, 1280px)';
  dialog.style.maxHeight = '94vh';
  dialog.style.overflowY = 'auto';
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
