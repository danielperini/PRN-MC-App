import { purgeReportPreviewHard } from '@/utils/reportPreviewPurge';

const RUNTIME_FLAG = '__museusCentroReportPurgeHardRuntime';
const BYPASS_ATTR = 'data-report-purge-hard-bypass';
const RUNNING_ATTR = 'data-report-purge-hard-running';

function normalize(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isReportGenerationButton(button) {
  const text = normalize(button?.textContent || '');
  return /^(Gerar relatórios|Gerar relatorios|Resetar cache e regerar|Pesquisar dados e atualizar relatorio|Pesquisar dados e atualizar relatório)$/i.test(text);
}

function isInsideReportGenerator(button) {
  const rootText = normalize(button?.closest?.('[role="dialog"], .bg-white, main, body')?.textContent || '');
  return /Gerar Relat[oó]rio|Escolha os conteudos do relatorio|Escolha os conteúdos do relatório|Relatório principal de dados/i.test(rootText);
}

function dispatchStatus(status, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('museus-centro-report-purge-status', {
      detail: {
        status,
        at: new Date().toISOString(),
        ...detail,
      },
    }));
  } catch {}
}

async function interceptReportGeneration(event) {
  const button = event.target?.closest?.('button');
  if (!button || button.disabled) return;
  if (button.getAttribute(BYPASS_ATTR) === 'true' || button.getAttribute(RUNNING_ATTR) === 'true') return;
  if (!isReportGenerationButton(button) || !isInsideReportGenerator(button)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  button.setAttribute(RUNNING_ATTR, 'true');
  window.__MUSEUS_CENTRO_REPORT_GENERATING__ = true;
  dispatchStatus('running', { label: 'Limpando cache e relatório antigo' });

  try {
    await purgeReportPreviewHard({ reason: 'before-report-generation', deleteDatabase: true });
    dispatchStatus('done', { label: 'Cache limpo. Gerando relatório novo.' });
  } catch (error) {
    console.warn('[Relatorio] Purge hard falhou; seguindo com geração para não bloquear o usuário.', error);
    dispatchStatus('error', { label: 'Falha ao limpar cache. Seguindo com geração.', message: error?.message || String(error) });
  } finally {
    button.removeAttribute(RUNNING_ATTR);
  }

  // Não manipular textContent, disabled ou filhos do botão: React controla esse DOM.
  // O clique real é reexecutado apenas depois do purge e com bypass pontual.
  window.setTimeout(() => {
    try {
      button.setAttribute(BYPASS_ATTR, 'true');
      button.click();
    } finally {
      window.setTimeout(() => button.removeAttribute(BYPASS_ATTR), 800);
    }
  }, 0);
}

export function installReportPurgeHardRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;
  window.__museusCentroPurgeReportPreviewHard = purgeReportPreviewHard;
  document.addEventListener('click', interceptReportGeneration, true);
}

installReportPurgeHardRuntime();
