const RUNTIME_FLAG = '__museusCentroReportEstimatedTimeRuntime';
const START_KEY = 'museus_centro_report_generation_started_at';

function now() {
  return Date.now();
}

function readStartTime() {
  try {
    return Number(sessionStorage.getItem(START_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function writeStartTime(value = now()) {
  try {
    sessionStorage.setItem(START_KEY, String(value));
  } catch {
    // noop
  }
}

function clearStartTime() {
  try {
    sessionStorage.removeItem(START_KEY);
  } catch {
    // noop
  }
}

function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const seconds = Math.ceil(safeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}min` : `${hours}h`;
}

function getPercentFromElement(element) {
  const text = String(element?.textContent || '');
  const match = text.match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const percent = Number(match[1]);
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, percent));
}

function getEtaText(percent) {
  if (percent >= 100) return 'Tempo estimado: concluído';
  if (percent <= 0) return 'Tempo estimado: calculando...';

  const startedAt = readStartTime();
  if (!startedAt) return 'Tempo estimado: calculando...';

  const elapsed = Math.max(1000, now() - startedAt);
  const remaining = Math.min(20 * 60 * 1000, Math.max(3000, (elapsed / percent) * (100 - percent)));
  return `Tempo estimado restante: ${formatDuration(remaining)}`;
}

function findProgressCards() {
  const candidates = Array.from(document.querySelectorAll('div'));
  return candidates.filter((node) => {
    const text = String(node.textContent || '');
    return (
      /Progresso da Gera[çc][aã]o dos Relat[oó]rios/i.test(text) ||
      /Progresso da Pesquisa e Atualiza[çc][aã]o/i.test(text) ||
      /Carregando dados do relat[oó]rio/i.test(text)
    ) && /\d{1,3}\s*%/.test(text);
  }).slice(0, 4);
}

function ensureEtaInCard(card) {
  if (!card) return;
  const percent = getPercentFromElement(card);
  if (percent === null) return;

  let eta = card.querySelector('[data-report-eta="true"]');
  if (!eta) {
    eta = document.createElement('p');
    eta.setAttribute('data-report-eta', 'true');
    eta.style.cssText = 'margin-top:6px;font-size:12px;line-height:1.35;font-weight:700;color:#334155;';
    card.appendChild(eta);
  }

  eta.textContent = getEtaText(percent);

  if (percent >= 100) {
    window.setTimeout(() => clearStartTime(), 1800);
  }
}

function updateEta() {
  if (typeof document === 'undefined') return;
  findProgressCards().forEach(ensureEtaInCard);
}

function isGenerateReportButton(target) {
  const button = target?.closest?.('button');
  if (!button) return false;
  const text = String(button.textContent || '');
  return /Gerar Relat[oó]rio|Gerar relat[oó]rios|PDF principal|PDF galeria|PDF atividades/i.test(text);
}

export function installReportEstimatedTimeRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;

  document.addEventListener('click', (event) => {
    if (isGenerateReportButton(event.target)) {
      writeStartTime();
      window.setTimeout(updateEta, 80);
      window.setTimeout(updateEta, 500);
    }
  }, { capture: true, passive: true });

  const observer = new MutationObserver(() => {
    updateEta();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.setInterval(updateEta, 1000);
  updateEta();
}

installReportEstimatedTimeRuntime();
