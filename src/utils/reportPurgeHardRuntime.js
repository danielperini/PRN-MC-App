import { purgeReportPreviewHard } from '@/utils/reportPreviewPurge';

const RUNTIME_FLAG = '__museusCentroReportPurgeHardRuntime';
const BYPASS_ATTR = 'data-report-purge-hard-bypass';

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

async function interceptReportGeneration(event) {
  const button = event.target?.closest?.('button');
  if (!button || button.disabled || button.getAttribute(BYPASS_ATTR) === 'true') return;
  if (!isReportGenerationButton(button) || !isInsideReportGenerator(button)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  try {
    button.textContent = 'Limpando cache e relatório antigo...';
    window.__MUSEUS_CENTRO_REPORT_GENERATING__ = true;
    await purgeReportPreviewHard({ reason: 'before-report-generation', deleteDatabase: true });
    button.textContent = 'Gerando relatório novo...';
  } catch (error) {
    console.warn('[Relatorio] Purge hard falhou; seguindo com geração para não bloquear o usuário.', error);
  } finally {
    button.disabled = originalDisabled;
    button.removeAttribute('aria-busy');
    button.textContent = originalText;
  }

  button.setAttribute(BYPASS_ATTR, 'true');
  button.click();
  window.setTimeout(() => {
    button.removeAttribute(BYPASS_ATTR);
  }, 800);
}

export function installReportPurgeHardRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[RUNTIME_FLAG]) return;
  window[RUNTIME_FLAG] = true;
  window.__museusCentroPurgeReportPreviewHard = purgeReportPreviewHard;
  document.addEventListener('click', interceptReportGeneration, true);
}

installReportPurgeHardRuntime();
