const OVERLAY_FLAG = '__museusCentroReportGenerationStepOverlay';
const PANEL_ID = 'museus-centro-report-generation-step-overlay';

const STEP_DEFINITIONS = [
  { key: 'inicio', title: 'Preparando geração', match: /Iniciando geração|Sincronizando dados/i },
  { key: 'limpeza', title: 'Limpando cache e relatório antigo', match: /Limpando previas|limpando cache|clearReportPreviewCache/i },
  { key: 'etapa1', title: 'Etapa 1 — Carregando dados do app', match: /ETAPA\s*1:\s*carregando dados/i },
  { key: 'etapa1done', title: 'Etapa 1 concluída — Dados carregados', match: /ETAPA\s*1\s*conclu[ií]da/i },
  { key: 'etapa2', title: 'Etapa 2 — Montando HTML principal', match: /ETAPA\s*2:\s*montando HTML principal/i },
  { key: 'etapa2done', title: 'Etapa 2 concluída — HTML principal pronto', match: /ETAPA\s*2\s*conclu[ií]da/i },
  { key: 'etapa3', title: 'Etapa 3 — Montando HTML galeria', match: /ETAPA\s*3:\s*montando HTML galeria/i },
  { key: 'etapa3done', title: 'Etapa 3 concluída — Galeria pronta', match: /ETAPA\s*3\s*conclu[ií]da/i },
  { key: 'etapa31', title: 'Etapa 3.1 — Montando relatório de atividades', match: /ETAPA\s*3\.1:\s*montando HTML atividades/i },
  { key: 'etapa31done', title: 'Etapa 3.1 concluída — Atividades prontas', match: /ETAPA\s*3\.1\s*conclu[ií]da/i },
  { key: 'etapa4', title: 'Etapa 4 — Salvando HTMLs', match: /ETAPA\s*4:\s*salvando HTMLs/i },
  { key: 'etapa4a', title: 'Etapa 4a — Conferindo localStorage', match: /ETAPA\s*4a:/i },
  { key: 'etapa5', title: 'Etapa 5 — Salvando em IndexedDB', match: /ETAPA\s*5:\s*salvando em IndexedDB/i },
  { key: 'etapa5done', title: 'Etapa 5 concluída — IndexedDB salvo', match: /ETAPA\s*5\s*conclu[ií]da/i },
  { key: 'etapa6', title: 'Etapa 6 — Verificando prévia salva', match: /ETAPA\s*6:\s*verificando/i },
  { key: 'etapa6done', title: 'Etapa 6 concluída — Prévia disponível', match: /ETAPA\s*6\s*conclu[ií]da/i },
];

let state = {
  visible: false,
  steps: [],
  lastMessage: '',
  percent: 0,
  finished: false,
};

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getPanel() {
  if (typeof document === 'undefined') return null;
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:9999',
      'width:min(520px,calc(100vw - 36px))',
      'max-height:min(72vh,620px)',
      'overflow:auto',
      'background:rgba(255,255,255,.98)',
      'border:1px solid #cbd5e1',
      'border-radius:18px',
      'box-shadow:0 20px 60px rgba(15,23,42,.18)',
      'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'color:#0f172a',
      'display:none',
    ].join(';');
    document.body.appendChild(panel);
  }
  return panel;
}

function render() {
  const panel = getPanel();
  if (!panel) return;
  if (!state.visible || state.steps.length === 0) {
    panel.style.display = 'none';
    return;
  }

  const total = STEP_DEFINITIONS.length;
  const completedCount = state.steps.length;
  const percent = Math.max(state.percent, Math.min(100, Math.round((completedCount / total) * 100)));
  const visibleSteps = state.steps.slice(-9);

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="padding:14px 16px 12px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#64748b;font-weight:800;">Geração dos relatórios</div>
        <div style="font-size:16px;font-weight:900;color:#0f172a;margin-top:3px;">Etapas em execução</div>
      </div>
      <div style="font-size:24px;font-weight:900;line-height:1;color:#0f172a;">${percent}%</div>
    </div>
    <div style="padding:12px 16px;">
      <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:12px;">
        <div style="height:100%;width:${percent}%;background:#0f172a;border-radius:999px;transition:width .25s ease;"></div>
      </div>
      <div style="display:grid;gap:7px;">
        ${visibleSteps.map((step, index) => {
          const isLast = index === visibleSteps.length - 1;
          return `
            <div style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start;padding:8px;border:1px solid ${isLast ? '#94a3b8' : '#e2e8f0'};border-radius:12px;background:${isLast ? '#f8fafc' : '#fff'};">
              <div style="width:24px;height:24px;border-radius:999px;background:${isLast && !state.finished ? '#0f172a' : '#dcfce7'};color:${isLast && !state.finished ? '#fff' : '#166534'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;">${isLast && !state.finished ? '•' : '✓'}</div>
              <div style="min-width:0;">
                <div style="font-size:12.5px;font-weight:800;color:#0f172a;line-height:1.25;">${step.title}</div>
                ${step.message ? `<div style="font-size:10.8px;color:#64748b;line-height:1.35;margin-top:2px;">${step.message}</div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function addStep(definition, message = '') {
  const exists = state.steps.some((item) => item.key === definition.key);
  if (exists) return;
  state = {
    ...state,
    visible: true,
    steps: [...state.steps, {
      key: definition.key,
      title: definition.title,
      message: compact(message),
      at: Date.now(),
    }],
    lastMessage: compact(message),
    finished: /conclu[ií]da|Relat[oó]rios prontos|pr[eé]via dispon/i.test(message),
  };
  render();
}

function captureMessage(args) {
  return compact(args.map((arg) => {
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }).join(' '));
}

function processMessage(message) {
  if (!/\[Relatorio\]|\[Relatório\]|ETAPA|Relat[oó]rios prontos/i.test(message)) return;

  if (/ETAPA\s*1:|Iniciando geração/i.test(message)) {
    state = { visible: true, steps: [], lastMessage: '', percent: 0, finished: false };
  }

  STEP_DEFINITIONS.forEach((definition) => {
    if (definition.match.test(message)) addStep(definition, message);
  });

  if (/Relat[oó]rios prontos|pr[eé]via verificada e dispon/i.test(message)) {
    state = { ...state, percent: 100, finished: true };
    render();
    window.setTimeout(() => {
      state = { ...state, visible: false };
      render();
    }, 7000);
  }
}

export function installReportGenerationStepOverlay() {
  if (typeof window === 'undefined' || window[OVERLAY_FLAG]) return;
  window[OVERLAY_FLAG] = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args) => {
    processMessage(captureMessage(args));
    originalLog(...args);
  };

  console.warn = (...args) => {
    processMessage(captureMessage(args));
    originalWarn(...args);
  };

  console.error = (...args) => {
    processMessage(captureMessage(args));
    originalError(...args);
  };

  window.addEventListener('beforeunload', () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });
}

installReportGenerationStepOverlay();
