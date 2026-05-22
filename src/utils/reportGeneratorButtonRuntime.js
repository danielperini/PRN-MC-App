const RUNTIME_FLAG = '__museusCentroReportGeneratorButtonRuntime';
const STYLE_ID = 'museus-centro-report-generator-button-style';
const START_KEY = 'museus_centro_report_generation_started_at';

function injectStyle() {
  if (typeof document === 'undefined') return;
  const previous = document.getElementById(STYLE_ID);
  if (previous) previous.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-report-primary-action="true"] {
      pointer-events: auto !important;
      opacity: 1 !important;
      cursor: pointer !important;
      min-height: 48px !important;
      padding-left: 22px !important;
      padding-right: 22px !important;
      font-weight: 800 !important;
      background: #020617 !important;
      color: #fff !important;
      border-color: #020617 !important;
      box-shadow: 0 10px 24px rgba(2, 6, 23, .18) !important;
    }

    [role="dialog"] button[data-report-primary-action="true"] {
      min-width: 220px !important;
    }

    [data-report-secondary-action="true"] {
      display: none !important;
    }

    [data-report-action-hint="true"] {
      width: 100%;
      margin-top: 8px;
      font-size: 11px;
      line-height: 1.35;
      color: #475569;
      text-align: right;
    }
  `;
  document.head.appendChild(style);
}

function writeStartTime() {
  try {
    sessionStorage.setItem(START_KEY, String(Date.now()));
  } catch {
    // noop
  }
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
  return /^Gerar relat[oó]rios$/i.test(text) || /^Gerar Relat[oó]rios$/i.test(text) || /^Gerar Relat[oó]rio$/i.test(text);
}

function isSecondaryReportButton(button) {
  const text = getButtonText(button);
  return /Resetar cache e regerar|Pesquisar dados e atualizar relatorio|Pesquisar dados e atualizar relatório/i.test(text);
}

function setButtonText(button, text) {
  if (!button || getButtonText(button) === text) return;
  const svg = button.querySelector('svg');
  button.textContent = '';
  if (svg) {
    button.appendChild(svg);
    button.appendChild(document.createTextNode(' '));
  }
  button.appendChild(document.createTextNode(text));
}

function markButton(button, primary = false) {
  if (!button) return;
  button.style.pointerEvents = 'auto';

  if (primary) {
    button.dataset.reportPrimaryAction = 'true';
    button.removeAttribute('aria-disabled');
    button.title = 'Limpa prévias antigas, atualiza dados do app e gera os três relatórios.';
    setButtonText(button, 'Gerar Relatório');

    if (button.hasAttribute('disabled')) {
      button.removeAttribute('disabled');
      button.disabled = false;
    }

    if (!button.__museusCentroReportStartPatched) {
      button.__museusCentroReportStartPatched = true;
      button.addEventListener('click', () => {
        writeStartTime();
      }, { capture: true });
    }
  } else {
    button.dataset.reportSecondaryAction = 'true';
    button.setAttribute('aria-hidden', 'true');
    button.tabIndex = -1;
  }
}

function ensureHint(dialog) {
  if (!dialog || dialog.querySelector('[data-report-action-hint="true"]')) return;
  const footer = Array.from(dialog.querySelectorAll('div, footer')).reverse().find((node) => {
    const text = String(node.textContent || '');
    return /Gerar relat[oó]rios|Gerar Relat[oó]rio|Pesquisar dados|Resetar cache/i.test(text);
  });
  if (!footer) return;
  const hint = document.createElement('p');
  hint.dataset.reportActionHint = 'true';
  hint.textContent = 'Botão único: limpa cache antigo, pesquisa dados atuais, consolida relatório principal, galeria e atividades. O tempo estimado aparece durante a geração.';
  footer.appendChild(hint);
}

function enhanceReportDialog(dialog) {
  if (!dialog || !isReportDialog(dialog)) return;
  const buttons = Array.from(dialog.querySelectorAll('button'));
  buttons.forEach((button) => {
    if (isSecondaryReportButton(button)) markButton(button, false);
  });
  buttons.forEach((button) => {
    if (isPrimaryReportButton(button)) markButton(button, true);
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
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('focusin', runPass, { passive: true });
  window.addEventListener('click', runPass, { passive: true });
}

installReportGeneratorButtonRuntime();
