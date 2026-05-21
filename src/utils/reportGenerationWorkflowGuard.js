const WORKFLOW_FLAG = '__museusCentroReportGenerationWorkflowGuard';
const PREVIEW_DB_NAME = 'museus_centro_report_preview';
const PREVIEW_KEYS = [
  'relatorio_fisico_financeiro_html',
  'relatorio_fisico_financeiro_meta',
  'relatorio_fisico_financeiro_dados_html',
  'relatorio_fisico_financeiro_dados_meta',
  'relatorio_fisico_financeiro_galeria_html',
  'relatorio_fisico_financeiro_galeria_meta',
  'relatorio_fisico_financeiro_atividades_html',
  'relatorio_fisico_financeiro_atividades_meta',
  'relatorio_fisico_financeiro_html_saved_at',
  'relatorio_fisico_financeiro_dados_html_saved_at',
  'relatorio_fisico_financeiro_galeria_html_saved_at',
  'relatorio_fisico_financeiro_atividades_html_saved_at',
  'relatorio_fisico_financeiro_galeria_html_storage',
  'relatorio_fisico_financeiro_atividades_html_storage',
  'relatorio_fisico_financeiro_selected_chapters',
  'relatorio_fisico_financeiro_all_chapters',
  'relatorio_fisico_financeiro_export_mode',
  'relatorio_fisico_financeiro_export_volume',
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeRemoveStorage(storage, key) {
  try { storage?.removeItem(key); } catch {}
}

function removeReportStorageKeys() {
  PREVIEW_KEYS.forEach((key) => {
    safeRemoveStorage(window.sessionStorage, key);
    safeRemoveStorage(window.localStorage, key);
  });

  try {
    Object.keys(window.localStorage || {}).forEach((key) => {
      if (/^relatorio_fisico_financeiro_.*(_html|_meta|_saved_at|_storage)$/i.test(key)) {
        safeRemoveStorage(window.localStorage, key);
      }
    });
  } catch {}

  try {
    Object.keys(window.sessionStorage || {}).forEach((key) => {
      if (/^relatorio_fisico_financeiro_.*(_html|_meta|_saved_at|_storage)$/i.test(key)) {
        safeRemoveStorage(window.sessionStorage, key);
      }
    });
  } catch {}
}

function deletePreviewDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(PREVIEW_DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
      window.setTimeout(() => resolve(false), 1200);
    } catch {
      resolve(false);
    }
  });
}

async function hardResetReportPreviewCache() {
  removeReportStorageKeys();
  await deletePreviewDb();
  removeReportStorageKeys();
  try {
    window.dispatchEvent(new CustomEvent('museus-centro-report-cache-cleared'));
  } catch {}
}

function getWorkflowRoot() {
  const dialog = Array.from(document.querySelectorAll('[role="dialog"], .fixed, div'))
    .find((node) => /Escolha os conteudos do relatorio|Escolha os conteúdos do relatório|Gerar Relatório|Gerar Relatorios|Gerar relatórios/i.test(node.textContent || ''));
  return dialog || document.body;
}

function buildStepItem(step, index) {
  const done = step.status === 'done';
  const running = step.status === 'running';
  const icon = done ? '✓' : running ? '●' : String(index + 1);
  const tone = done ? '#166534' : running ? '#0f172a' : '#64748b';
  const bg = done ? '#dcfce7' : running ? '#e2e8f0' : '#f8fafc';
  return `
    <div style="display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start;padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:${bg};">
      <div style="width:28px;height:28px;border-radius:999px;background:#fff;border:1px solid #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:${tone};">${icon}</div>
      <div style="min-width:0;">
        <p style="margin:0;font-size:13px;font-weight:800;color:#0f172a;">${step.title}</p>
        <p style="margin:3px 0 0;font-size:11.5px;line-height:1.45;color:#475569;">${step.detail}</p>
        ${step.log ? `<p style="margin:7px 0 0;font-size:10.5px;line-height:1.45;color:#64748b;">${step.log}</p>` : ''}
      </div>
    </div>`;
}

function getInitialWorkflowState() {
  return {
    active: false,
    completed: false,
    steps: [
      {
        title: '1. Limpando cache e relatório antigo',
        detail: 'Removendo HTML antigo, metadados, localStorage, sessionStorage e prévias salvas no IndexedDB.',
        status: 'pending',
        log: '',
      },
      {
        title: '2. Importando capítulos e dados atuais',
        detail: 'Carregando dados reais do app e montando principal, galeria e atividades.',
        status: 'pending',
        log: '',
      },
      {
        title: '3. Revisando e aprovando documento',
        detail: 'Aplicando limpeza editorial, removendo páginas em branco e preparando download em PDF.',
        status: 'pending',
        log: '',
      },
    ],
  };
}

let workflowState = getInitialWorkflowState();
let resetInProgress = false;
let releaseTimer = null;

function updateWorkflow(updater) {
  workflowState = updater(workflowState);
  renderWorkflowPanel();
}

function setStep(index, status, detail, log = '') {
  updateWorkflow((state) => ({
    ...state,
    steps: state.steps.map((step, stepIndex) => (
      stepIndex === index
        ? { ...step, status, detail: detail || step.detail, log: log || step.log }
        : step
    )),
  }));
}

function collectSelectedChapterLabels() {
  const root = getWorkflowRoot();
  const labels = Array.from(root.querySelectorAll('label'))
    .map((label) => compact(label.textContent))
    .filter((text) => /^\d+\./.test(text))
    .slice(0, 18)
    .map((text) => text.replace(/\s+/g, ' ').slice(0, 90));
  return labels;
}

function renderWorkflowPanel() {
  const root = getWorkflowRoot();
  if (!root) return;

  let panel = root.querySelector('[data-report-workflow-panel="true"]');
  if (!panel) {
    panel = document.createElement('div');
    panel.setAttribute('data-report-workflow-panel', 'true');
    panel.style.cssText = 'margin:0 0 16px;padding:14px;border:1px solid #cbd5e1;border-radius:18px;background:#fff;box-shadow:0 12px 32px rgba(15,23,42,.08);';
    const target = root.querySelector('.space-y-5, .space-y-4') || root;
    target.insertBefore(panel, target.firstElementChild || null);
  }

  const actions = workflowState.completed
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
        <a href="/RelatorioPreview?report=dados" target="_blank" rel="noreferrer" style="border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;background:#fff;">Abrir principal</a>
        <a href="/RelatorioPreview?report=dados&export=pdf" target="_blank" rel="noreferrer" style="border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;background:#fff;">PDF principal</a>
        <a href="/RelatorioPreview?report=galeria&export=pdf" target="_blank" rel="noreferrer" style="border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;background:#fff;">PDF galeria</a>
        <a href="/RelatorioPreview?report=atividades&export=pdf" target="_blank" rel="noreferrer" style="border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;color:#0f172a;text-decoration:none;background:#fff;">PDF atividades</a>
      </div>`
    : '';

  panel.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
      <div>
        <p style="margin:0;font-size:13px;font-weight:900;color:#0f172a;">Geração controlada do relatório</p>
        <p style="margin:3px 0 0;font-size:11.5px;line-height:1.45;color:#64748b;">O botão executa limpeza, importação dos capítulos e revisão final antes de liberar os PDFs.</p>
      </div>
      <span style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${workflowState.completed ? '#166534' : '#475569'};">${workflowState.completed ? 'Concluído' : workflowState.active ? 'Em execução' : 'Pronto'}</span>
    </div>
    <div style="display:grid;gap:8px;">${workflowState.steps.map(buildStepItem).join('')}</div>
    ${actions}
  `;
}

function hideSecondaryGenerateButtons() {
  const root = getWorkflowRoot();
  Array.from(root.querySelectorAll('button')).forEach((button) => {
    const text = compact(button.textContent);
    if (/Resetar cache e regerar|Pesquisar dados e atualizar relatorio|Pesquisar dados e atualizar relatório/i.test(text)) {
      button.style.display = 'none';
    }
  });
}

function updateFromProgressDom() {
  const text = compact(document.body?.textContent || '');
  if (!workflowState.active && !workflowState.completed) return;

  if (/Limpando previas antigas|Limpando prévias antigas|Removendo HTML|Removendo cache/i.test(text)) {
    setStep(0, 'running');
  }

  if (/Carregando dados do app|Montando HTML principal|Montando HTML galeria|Montando HTML atividades|Salvando relatórios|Importando/i.test(text)) {
    const chapters = collectSelectedChapterLabels();
    setStep(0, 'done');
    setStep(1, 'running', null, chapters.length ? `Capítulos: ${chapters.join(' · ')}` : 'Importando capítulos selecionados e relatórios vinculados.');
  }

  if (/Verificando prévia|Aplicando limpeza|Revisando|Relatórios prontos|Relatorio gerado com sucesso|Relatório gerado com sucesso/i.test(text)) {
    setStep(0, 'done');
    setStep(1, 'done');
    setStep(2, /Relatórios prontos|Relatorio gerado com sucesso|Relatório gerado com sucesso/i.test(text) ? 'done' : 'running');
  }

  if (/Relatórios gerados: principal, galeria e atividades|Relatório gerado com sucesso|Relatorio gerado com sucesso/i.test(text)) {
    workflowState = {
      ...workflowState,
      active: false,
      completed: true,
      steps: workflowState.steps.map((step) => ({ ...step, status: 'done' })),
    };
    window.__MUSEUS_CENTRO_REPORT_GENERATING__ = false;
    renderWorkflowPanel();
  }
}

async function interceptGenerateClick(event) {
  const button = event.target?.closest?.('button');
  if (!button) return;
  const text = compact(button.textContent);
  const isGenerate = /^Gerar Relatório$|^Gerar Relatorio$|^Gerar relatórios$|^Gerar relatorios$/i.test(text);
  if (!isGenerate || button.dataset.reportWorkflowBypass === 'true' || button.disabled) return;

  // O botão externo apenas abre o formulário. A limpeza pesada deve ocorrer no botão final do diálogo.
  const insideDialog = Boolean(button.closest('[role="dialog"]'));
  if (!insideDialog) {
    window.setTimeout(() => {
      workflowState = getInitialWorkflowState();
      renderWorkflowPanel();
      hideSecondaryGenerateButtons();
    }, 60);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (resetInProgress) return;

  resetInProgress = true;
  window.__MUSEUS_CENTRO_REPORT_GENERATING__ = true;
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    window.__MUSEUS_CENTRO_REPORT_GENERATING__ = false;
  }, 8 * 60 * 1000);

  workflowState = getInitialWorkflowState();
  workflowState.active = true;
  setStep(0, 'running');
  renderWorkflowPanel();

  await hardResetReportPreviewCache();

  setStep(0, 'done', 'Cache antigo removido. O relatório será reconstruído sem reaproveitar HTML anterior.');
  const chapters = collectSelectedChapterLabels();
  setStep(1, 'running', 'Importando dados atuais e capítulos selecionados.', chapters.length ? `Capítulos: ${chapters.join(' · ')}` : 'Capítulos selecionados serão importados agora.');

  resetInProgress = false;
  button.dataset.reportWorkflowBypass = 'true';
  button.click();
  window.setTimeout(() => {
    delete button.dataset.reportWorkflowBypass;
  }, 600);
}

function installObserver() {
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(() => {
    renderWorkflowPanel();
    hideSecondaryGenerateButtons();
    updateFromProgressDom();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  renderWorkflowPanel();
  hideSecondaryGenerateButtons();
}

export function installReportGenerationWorkflowGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || window[WORKFLOW_FLAG]) return;
  window[WORKFLOW_FLAG] = true;
  window.__museusCentroHardResetReportPreviewCache = hardResetReportPreviewCache;
  document.addEventListener('click', interceptGenerateClick, true);
  installObserver();
}

installReportGenerationWorkflowGuard();
