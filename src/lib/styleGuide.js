/**
 * PADRÃO VISUAL DO SISTEMA — PRETO E BRANCO
 * 
 * Este arquivo define os padrões visuais consistentes para toda a aplicação.
 * Usar estes valores garante consistência e facilita manutenção.
 */

export const STATUS_STYLES = {
  // Estados de processamento
  PENDENTE: {
    label: 'Pendente',
    color: 'bg-white border-2 border-black text-black',
    icon: 'Clock'
  },
  EM_ANALISE: {
    label: 'Em Análise',
    color: 'bg-white border-2 border-black text-black',
    icon: 'Clock'
  },
  DRAFT: {
    label: 'Rascunho',
    color: 'bg-white border-2 border-black text-black',
    icon: 'Clock'
  },
  
  // Estados de aprovação
  APROVADO: {
    label: 'Aprovado',
    color: 'bg-black text-white',
    icon: 'CheckCircle'
  },
  APROVADO_COORD: {
    label: 'Aprovado (Coord)',
    color: 'bg-black text-white',
    icon: 'CheckCircle'
  },
  APROVADO_ADMIN: {
    label: 'Aprovado (Admin)',
    color: 'bg-black text-white',
    icon: 'CheckCircle'
  },
  
  // Estados finais
  PAGO: {
    label: 'Pago',
    color: 'bg-black text-white',
    icon: 'CheckCircle'
  },
  ENVIADO: {
    label: 'Enviado',
    color: 'bg-black text-white',
    icon: 'Send'
  },
  APPROVED: {
    label: 'Aprovado',
    color: 'bg-black text-white',
    icon: 'CheckCircle'
  },
  
  // Estados de erro/devolução
  RECUSADO: {
    label: 'Recusado',
    color: 'bg-white border-2 border-black text-black',
    icon: 'XCircle'
  },
  RETURNED: {
    label: 'Devolvido',
    color: 'bg-white border-2 border-black text-black',
    icon: 'AlertCircle'
  },
  REJECTED: {
    label: 'Rejeitado',
    color: 'bg-white border-2 border-black text-black',
    icon: 'XCircle'
  },
  
  // Arquivamento
  ARCHIVED: {
    label: 'Arquivado',
    color: 'bg-gray-200 text-black',
    icon: 'Archive'
  }
};

export const BUTTON_STYLES = {
  primary: 'bg-black text-white hover:bg-gray-900 font-medium',
  secondary: 'border-2 border-black text-black hover:bg-black hover:text-white font-medium',
  danger: 'border-2 border-black text-black hover:bg-black hover:text-white font-medium',
  success: 'bg-black text-white hover:bg-gray-900 font-medium',
  disabled: 'bg-gray-300 text-gray-600 cursor-not-allowed'
};

export const CARD_STYLES = {
  container: 'border-2 border-black rounded-xl p-4 bg-white',
  stat: 'border-2 border-black rounded-xl p-4 bg-white',
  header: 'border-b-2 border-black bg-black text-white',
  alert: 'border-2 border-black bg-white text-black rounded-lg p-3'
};

export const FEEDBACK_MESSAGES = {
  loading: {
    saving: 'Salvando...',
    sending: 'Enviando...',
    processing: 'Processando...',
    approving: 'Aprovando...',
    paying: 'Pagando...',
    loading: 'Carregando...'
  },
  success: {
    saved: 'Salvo com sucesso',
    sent: 'Enviado com sucesso',
    approved: 'Aprovado com sucesso',
    paid: 'Pagamento realizado',
    deleted: 'Removido com sucesso'
  },
  error: {
    default: 'Erro ao executar ação',
    validation: 'Preencha todos os campos obrigatórios',
    notFound: 'Recurso não encontrado',
    unauthorized: 'Acesso negado',
    conflict: 'Conflito: recurso já existe'
  },
  empty: {
    noData: 'Sem dados disponíveis',
    noResults: 'Nenhum resultado encontrado'
  }
};

/**
 * Função auxiliar para renderizar status com estilo correto
 */
export function getStatusStyle(status) {
  return STATUS_STYLES[status] || {
    label: status,
    color: 'bg-white border-2 border-black text-black',
    icon: 'AlertCircle'
  };
}

/**
 * Função auxiliar para formatar valores monetários
 */
export function formatBRL(value) {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}