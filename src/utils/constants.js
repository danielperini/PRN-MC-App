/**
 * Constantes Globais do Sistema - Museus Centro
 * 
 * Centraliza todas as constantes utilizadas em múltiplos arquivos
 * para facilitar manutenção e evitar duplicação.
 */

// ============================================================================
// MESES E DATAS
// ============================================================================

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MESES_UPPER = [
  'JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

export const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

// ============================================================================
// MUSEUS E CENTROS DE CUSTO
// ============================================================================

export const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

export const MUSEUS_COMPLETO = {
  MHAB: 'Museu Histórico Abílio Barreto',
  MIS: 'Museu de Artes e Ofícios',
  MUMO: 'Museu da Moda'
};

export const CENTROS_CUSTO = [
  'MHAB',
  'MIS',
  'MUMO',
  'Noturno 2026',
  'Noturno Pampulha',
  'Publicações',
  'Geral'
];

export const NOTURNO_PAMPULHA_KEYWORDS = ['pampulha', 'kubitschek', 'casa do baile'];

// ============================================================================
// STATUS DE RELATÓRIOS
// ============================================================================

export const STATUS_RELATORIOS = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700' },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700' },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Arquivado', color: 'bg-slate-100 text-slate-600' }
};

// ============================================================================
// STATUS DE COMPRAS
// ============================================================================

export const STATUS_COMPRAS = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SOLICITADO: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700' },
  DEVOLVIDO: { label: 'Devolvido', color: 'bg-amber-100 text-amber-700' },
  APROVADO_COORD: { label: 'Aprovado Coord.', color: 'bg-green-100 text-green-700' },
  APROVADO_ADMIN: { label: 'Aprovado Admin.', color: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Reprovado', color: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
  PAGO: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700' }
};

export const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

// ============================================================================
// TIPOS DE DOCUMENTOS
// ============================================================================

export const TIPOS_DOCUMENTO = {
  NF_PDF: 'NOTA_FISCAL_PDF',
  NF_XML: 'NOTA_FISCAL_XML',
  RECIBO: 'RECIBO',
  COMPROVANTE: 'COMPROVANTE',
  CONTRATO: 'CONTRATO',
  DOCUMENTO_ADMIN: 'DOCUMENTO_ADMINISTRATIVO',
  FOTO_ATIVIDADE: 'FOTO_ATIVIDADE'
};

// ============================================================================
// CHAVES DE CACHE
// ============================================================================

export const CACHE_KEYS = {
  // Relatórios
  RELATORIOS_LIST: 'relatorios_list_cache_v1',
  RELATORIOS_FISICO_FINANCEIRO_HTML: 'relatorio_fisico_financeiro_html',
  RELATORIOS_FISICO_FINANCEIRO_META: 'relatorio_fisico_financeiro_meta',
  RELATORIOS_FISICO_FINANCEIRO_DADOS_HTML: 'relatorio_fisico_financeiro_dados_html',
  RELATORIOS_FISICO_FINANCEIRO_GALERIA_HTML: 'relatorio_fisico_financeiro_galeria_html',
  
  // Dashboard
  DASHBOARD_UPDATE: 'dashboard-update',
  DASHBOARD_VIEW_MODE: 'museus_centro_dashboard_view_mode',
  NEWS_HIGHLIGHT_CACHE_V2: 'museus_centro_news_highlight_cache_v2',
  NEWS_HIGHLIGHT_CACHE_V3: 'museus_centro_news_highlight_cache_v3',
  
  // Permissões
  USER_PERMISSION_PREFIX: 'museus_centro_user_permission_',
  
  // Relatórios Preview
  RELATORIO_PREVIEW_SELECTED_CHAPTERS: 'relatorio_fisico_financeiro_selected_chapters',
  RELATORIO_PREVIEW_ALL_CHAPTERS: 'relatorio_fisico_financeiro_all_chapters',
  RELATORIO_PREVIEW_EXPORT_MODE: 'relatorio_fisico_financeiro_export_mode',
  RELATORIO_PREVIEW_EXPORT_VOLUME: 'relatorio_fisico_financeiro_export_volume'
};

// ============================================================================
// CONFIGURAÇÕES DE CACHE
// ============================================================================

export const CACHE_CONFIG = {
  PERMISSION_TIMEOUT_MS: 2200,
  PERMISSION_CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutos
  PERMISSION_RATE_LIMIT_COOLDOWN_MS: 90 * 1000, // 90 segundos
  DASHBOARD_STALE_TIME_MS: 2 * 60 * 1000, // 2 minutos
  AGENDA_STALE_TIME_MS: 5 * 60 * 1000, // 5 minutos
  RUBRICAS_STALE_TIME_MS: 2 * 60 * 1000 // 2 minutos
};

// ============================================================================
// CONFIGURAÇÕES DE BACKUP DRIVE
// ============================================================================

export const BACKUP_CONFIG = {
  PARENT_FOLDER_ID: '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3',
  BATCH_SIZE: 10,
  MAX_LOOPS: 50,
  SKIP_HOURS: 24, // Não refazer backup se já feito nas últimas 24h
  ROOT_FOLDER_NAME: 'Relatórios',
  NF_FOLDER_PREFIX: 'Notas Fiscais'
};

// ============================================================================
// EMAILS FIXOS
// ============================================================================

export const EMAILS_FIXOS = {
  NOTAS_FISCAIS: 'notasfiscais@viadutodasartes.org.br',
  DANIEL_PERINI: ['danielperini.mc@viadutodasartes.org.br', 'daniell@periniprojetos.com.br'],
  TOMADOR_VIADUTO: {
    nome: 'VIADUTO DAS ARTES',
    cnpj: '23843648000125',
    inscricao: ['0745690001', '0.745.690/001-X'],
    email: 'viadutodasartes@viadutodasartes.org.br'
  }
};

// ============================================================================
// METAS DO 3º ADITIVO
// ============================================================================

export const METAS_ADITIVO = {
  MC3A_20: 'MC3A-20',
  MC3A_21: 'MC3A-21',
  MC3A_22: 'MC3A-22',
  MC3A_23: 'MC3A-23',
  MC3A_24: 'MC3A-24',
  MC3A_25: 'MC3A-25',
  MC3A_EXTRA: 'MC3A-EXTRA'
};

// ============================================================================
// UTILITÁRIOS
// ============================================================================

export function getMesExtenso(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const month = d.getMonth();
  return MESES[Number.isFinite(month) ? month : new Date().getMonth()];
}

export function getMesExtensoUpper(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const month = d.getMonth();
  return MESES_UPPER[Number.isFinite(month) ? month : new Date().getMonth()];
}

export function getMesAbreviado(dateValue) {
  const d = dateValue ? new Date(dateValue) : new Date();
  const month = d.getMonth();
  return MESES_ABREV[Number.isFinite(month) ? month : new Date().getMonth()];
}

export function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function formatMonthLabel(key) {
  return parseMonthKey(key).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

export function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNoturno(purchase) {
  const cc = String(purchase?.centro_custo || '').toLowerCase();
  const desc = String(purchase?.descricao_item || purchase?.observacoes || '').toLowerCase();
  const rubNome = String(purchase?.rubrica_nome || '').toLowerCase();
  
  return NOTURNO_PAMPULHA_KEYWORDS.some(keyword => 
    cc.includes(keyword) || desc.includes(keyword) || rubNome.includes(keyword)
  );
}