const RUNTIME_FLAG = '__museusCentroReportGeneratorButtonRuntime';
const STYLE_ID = 'museus-centro-report-generator-button-style';

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-report-primary-action="true"] {
      pointer-events: auto !important;
      opacity: 1 !important;
      cursor: pointer !important;
    }

    [role="dialog"] button[data-report-primary-action="true"] {
      min-height: 44px !important;
      font-weight: 700 !important;
    }

    [data-report-action-hint="true"] {
      margin-top: 8px;
      font-size: 11px;
      line-height: 1.35;
      color: #475569;
    }
  `;
  document.head.appendChild(style);
}

function isReportDialog(dialog) {
  const text = String(dialog?.textContent || '');
  return /Escolha os conteudos do relatorio|Escolha os conteúdos do relatório|Capitulos editoriais|Capítulos editoriais/i.test(text);
}

function getButtonText(button) {
  return String(button?.textContent || '').replace(/\s+/g, ' ').trim();
}

function isPrimaryReportButton(button) {
  const text = getButtonText(button);
  return /^Gerar relat[oó]rios$/i.test(text) || /^Gerar Relat[oó]rios$/i.test(text);
}

function isSecondaryReportButton(button) {
  const text = getButtonText(button);
  return /Resetar cache e regerar|Pesquisar dados e atualizar relatorio|Pesquisar dados e atualizar relatório/i.test(text);
}

function markButton(button, primary = false) {
  if (!button) return;
  button.style.pointerEvents = 'auto';
  if (primary) {
    button.dataset.reportPrimaryAction = 'true';
    button.removeAttribute('aria-disabled');

    const disabled = button.hasAttribute('disabled');
    if (disabled) {
      button.removeAttribute('disabled');
      button.disabled = false;
    }
  }
}

function ensureHint(dialog) {
  if (!dialog || dialog.querySelector('[data-report-action-hint="true"]')) return;
  const footer = Array.from(dialog.querySelectorAll('div, footer')).reverse().find((node) => {
    const text = String(node.textContent || '');
    return /Gerar relat[oó]rios|Pesquisar dados|Resetar cache/i.test(text);
  });
  if (!footer) return;
  const hint = document.createElement('p');
  hint.dataset.reportActionHint = 'true';
  hint.textContent = 'Se o botão principal não responder, use “Resetar cache e regerar”. O sistema limpará a prévia antiga e iniciará uma nova geração.';
  footer.appendChild(hint);
}

function enhanceReportDialog(dialog) {
  if (!dialog || !isReportDialog(dialog)) return;
  const buttons = Array.from(dialog.querySelectorAll('button'));
  buttons.forEach((button) => {
    if (isPrimaryReportButton(button)) markButton(button, true);
    if (isSecondaryReportButton(button)) markButton(button, false);
  });
  ensureHint(dialog);
}

function runPass() {
  if (typeof document === 'undefined') return;
  injectStyle();
  document.querySelectorAll('[role="dialog"]').forEach(enhanceReportDialog);
}

export function installReportGeneratorButtonRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;

  runPass();
  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(runPass);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('focusin', runPass, { passive: true });
  window.addEventListener('click', runPass, { passive: true });
}

installReportGeneratorButtonRuntime();
