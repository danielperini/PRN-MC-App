import { normalizeHtmlForReport } from '@/utils/reportTextHelpers';

const BANNED_SENTENCES = [
  /A continuidade do Projeto Museus Centro se apresenta como uma oportunidade significativa[^<]*(?:<\/p>)?/gi,
  /A busca pela excelência nas ações educativas[^<]*(?:<\/p>)?/gi,
  /Conclui-se que o período consolidado demonstra avanço relevante[^<]*(?:<\/p>)?/gi,
  /A organização das atividades por natureza institucional[^<]*(?:<\/p>)?/gi,
  /O relatório evidencia a importância de diferenciar ações públicas[^<]*(?:<\/p>)?/gi,
];

const AI_MARKS = [
  /\bconclui-se que\b/gi,
  /\bevidencia a importância\b/gi,
  /\bbusca pela excelência\b/gi,
  /\bde forma significativa\b/gi,
  /\bcom grande importância\b/gi,
  /\bações relevantes\b/gi,
];

function stripVisibleMarkup(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, ' ')
    .replace(/&lt;\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^&]*&gt;/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ');
}

function reviseVisibleText(text = '') {
  return stripVisibleMarkup(text)
    .replace(/[—–]/g, ',')
    .replace(/\brelatorio\b/gi, 'relatório')
    .replace(/\brelatorios\b/gi, 'relatórios')
    .replace(/\bpublico\b/gi, 'público')
    .replace(/\bprogramacao\b/gi, 'programação')
    .replace(/\bcomunicacao\b/gi, 'comunicação')
    .replace(/\bperiodo\b/gi, 'período')
    .replace(/\bredund,ncia\b/gi, 'redundância')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function removeBannedClosing(html = '') {
  return BANNED_SENTENCES.reduce((current, pattern) => current.replace(pattern, ''), html);
}

function removeAiMarks(html = '') {
  return AI_MARKS.reduce((current, pattern) => current.replace(pattern, ''), html);
}

function reviewTextNodes(html = '') {
  return html.replace(/>([^<>]+)</g, (match, text) => `>${reviseVisibleText(text)}<`);
}

function reviewImageAlts(html = '') {
  return html.replace(/alt="([^"]*)"/g, (match, value) => {
    const clean = reviseVisibleText(value)
      .replace(/^whatsapp image.*$/i, 'Registro vinculado à atividade do relatório')
      .replace(/^img[-_\s]?\d+.*$/i, 'Registro vinculado à atividade do relatório');
    return `alt="${clean || 'Registro vinculado à atividade do relatório'}"`;
  });
}

function normalizeTables(html = '') {
  return html
    .replace(/<th>\s*<\/th>/g, '<th>Informação</th>')
    .replace(/<td>\s*<\/td>/g, '<td>Não informado</td>');
}

export function revisarHtmlRelatorioAntesDaExportacao(html = '', options = {}) {
  let reviewed = String(html || '');
  reviewed = removeBannedClosing(reviewed);
  reviewed = removeAiMarks(reviewed);
  reviewed = reviewImageAlts(reviewed);
  reviewed = reviewTextNodes(reviewed);
  reviewed = reviewed
    .replace(/&lt;\s*br\s*\/?\s*&gt;/gi, ' ')
    .replace(/&lt;\s*\/?\s*(p|div|span|strong|b|em|i|h[1-6]|ul|ol|li|section|article)[^&]*&gt;/gi, ' ')
    .replace(/&lt;[^&]*&gt;/g, ' ');
  reviewed = normalizeTables(reviewed);
  reviewed = normalizeHtmlForReport(reviewed);
  reviewed = reviewed.replace(/<!--\s*editorial-review:[\s\S]*?-->/g, '');
  reviewed = reviewed.replace('</body>', `<!-- editorial-review: PT-BR, ortografia, legendas, títulos, tabelas e imagens revisados automaticamente antes da exportação (${options.modo || 'relatorio'}). --></body>`);
  return reviewed;
}

export default revisarHtmlRelatorioAntesDaExportacao;
