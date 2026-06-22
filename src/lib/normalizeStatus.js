/**
 * Normalização canônica de status para PurchaseRequest.
 * Centraliza toda a lógica de equivalência entre status.
 */

// Remove acentos, espaços extras, hífens vs underscore
function limpar(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '_')
    .trim()
    .toUpperCase();
}

// Status pendentes de aprovação (qualquer variação)
const PENDENTES_APROVACAO = new Set([
  'SOLICITADO',
  'PENDENTE',
  'PENDENTE_APROVACAO',
  'AGUARDANDO_APROVACAO',
  'EM_ANALISE',
  'DOCUMENTO_PROCESSADO',
  'NOTA_VERIFICADA',
  'PRONTO_PARA_APROVACAO',
  'ENVIADO',
  'ENVIADO_APROVACAO',
  'RASCUNHO',
  'ANALISANDO_IA',
  'AGUARDANDO_REVISAO',
]);

const APROVADOS = new Set([
  'APROVADO',
  'APROVADO_COORD',
  'APROVADO_ADMIN',
]);

const FINALIZADOS = new Set([
  ...APROVADOS,
  'PAGO',
  'RECUSADO',
  'REJEITADO',
  'CANCELADO',
  'DEVOLVIDO',
  'EXCLUIDO',
  'EXCLUIDO_APROVACAO',
  'DELETADO',
]);

/**
 * Retorna o status canônico normalizado.
 */
export function normalizeStatus(value) {
  return limpar(value);
}

/**
 * Verifica se é um status pendente de aprovação (qualquer variação).
 */
export function isStatusPendente(value) {
  return PENDENTES_APROVACAO.has(limpar(value));
}

/**
 * Verifica se é um status aprovado.
 */
export function isStatusAprovado(value) {
  return APROVADOS.has(limpar(value));
}

/**
 * Verifica se é um status finalizado (não está mais pendente).
 */
export function isStatusFinalizado(value) {
  return FINALIZADOS.has(limpar(value));
}

/**
 * Retorna o label canônico para exibição.
 */
export function getStatusLabel(value) {
  const map = {
    SOLICITADO: 'Solicitado',
    PENDENTE: 'Pendente',
    PENDENTE_APROVACAO: 'Pendente',
    AGUARDANDO_APROVACAO: 'Aguardando',
    EM_ANALISE: 'Em Análise',
    DOCUMENTO_PROCESSADO: 'Processado',
    NOTA_VERIFICADA: 'NF Verificada',
    PRONTO_PARA_APROVACAO: 'Pronto',
    ENVIADO: 'Enviado',
    ENVIADO_APROVACAO: 'Enviado',
    RASCUNHO: 'Rascunho',
    ANALISANDO_IA: 'Analisando IA',
    AGUARDANDO_REVISAO: 'Aguardando',
    APROVADO: 'Aprovado',
    APROVADO_COORD: 'Aprovado',
    APROVADO_ADMIN: 'Aprovado',
    PAGO: 'Pago',
    RECUSADO: 'Reprovado',
    REJEITADO: 'Reprovado',
    CANCELADO: 'Cancelado',
    DEVOLVIDO: 'Devolvido',
    EXCLUIDO: 'Excluído',
    EXCLUIDO_APROVACAO: 'Excluído',
    DELETADO: 'Excluído',
  };
  const key = limpar(value);
  return map[key] || value || '—';
}

/**
 * Retorna a cor do badge para o status.
 */
export function getStatusColor(value) {
  const key = limpar(value);
  if (isStatusPendente(key)) return 'bg-blue-100 text-blue-700';
  if (APROVADOS.has(key)) return 'bg-green-100 text-green-700';
  if (key === 'PAGO') return 'bg-emerald-100 text-emerald-700';
  if (key === 'RECUSADO' || key === 'REJEITADO') return 'bg-red-100 text-red-700';
  if (key === 'DEVOLVIDO') return 'bg-amber-100 text-amber-700';
  if (key === 'CANCELADO' || key === 'EXCLUIDO' || key === 'DELETADO') return 'bg-gray-100 text-gray-500';
  return 'bg-gray-100 text-gray-600';
}

export { PENDENTES_APROVACAO, APROVADOS, FINALIZADOS };