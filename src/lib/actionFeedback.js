import { toast } from 'sonner';

const MESSAGES = {
  // Sucesso
  saved: 'Salvo com sucesso.',
  sent: 'Enviado com sucesso.',
  created: 'Cadastro realizado com sucesso.',
  recorded: 'Registro gravado com sucesso.',
  deleted: 'Excluído com sucesso.',
  approved: 'Aprovado com sucesso.',
  returned: 'Devolvido para ajuste.',
  linked: 'Arquivo vinculado com sucesso.',
  exported: 'Arquivo exportado com sucesso.',
  backup: 'Backup sincronizado com sucesso.',
  loggedIn: 'Acesso realizado com sucesso.',
  copied: 'Copiado para a área de transferência.',
  updated: 'Atualizado com sucesso.',
  unlinked: 'Desvinculado com sucesso.',

  // Erro genérico
  error: 'Não foi possível completar a ação. Tente novamente.',
  saveFailed: 'Não foi possível salvar. Tente novamente.',
  sendFailed: 'Não foi possível enviar. Verifique os dados e tente novamente.',
  deleteFailed: 'Não foi possível excluir. Tente novamente.',
  createFailed: 'Não foi possível criar o registro. Tente novamente.',
  updateFailed: 'Não foi possível atualizar. Tente novamente.',
  uploadFailed: 'Não foi possível fazer upload do arquivo.',
  exportFailed: 'Não foi possível exportar. Tente novamente.',
  loginFailed: 'Não foi possível concluir o login.',

  // Autenticação
  permission: 'Você não tem permissão para executar esta ação.',
  notAuthenticated: 'Você precisa fazer login para continuar.',
  sessionExpired: 'Sua sessão expirou. Faça login novamente.',

  // Rede
  networkError: 'Falha de conexão. Tente novamente.',
  timeout: 'A requisição levou muito tempo. Tente novamente.',

  // Validação
  requiredFields: 'Preencha todos os campos obrigatórios.',
  invalidEmail: 'E-mail inválido.',
  passwordMismatch: 'As senhas não conferem.',
  passwordTooShort: 'A senha deve ter no mínimo 8 caracteres.',

  // Arquivo
  fileFailed: 'Não foi possível processar o arquivo.',
  fileTooBig: 'O arquivo é muito grande (máx: 25MB).',
  invalidFileType: 'Tipo de arquivo não permitido.',
};

/**
 * Exibe mensagem de sucesso
 */
export function showSuccess(key = 'saved', customMessage = null) {
  const msg = customMessage || MESSAGES[key] || MESSAGES.saved;
  return toast.success(msg, {
    duration: 3000,
    position: 'top-right',
  });
}

/**
 * Exibe mensagem de erro
 */
export function showError(key = 'error', customMessage = null) {
  const msg = customMessage || MESSAGES[key] || MESSAGES.error;
  console.warn(`[App Error]: ${msg}`);
  return toast.error(msg, {
    duration: 4000,
    position: 'top-right',
  });
}

/**
 * Exibe mensagem de info
 */
export function showInfo(message) {
  return toast.info(message, {
    duration: 3000,
    position: 'top-right',
  });
}

/**
 * Exibe message de alerta
 */
export function showWarning(message) {
  return toast.warning(message, {
    duration: 3000,
    position: 'top-right',
  });
}

/**
 * Helpers de erros de rede/API
 */
export function handleApiError(error, defaultKey = 'error') {
  if (!error) return showError(defaultKey);

  // Status HTTP específicos
  if (error.response?.status === 403) return showError('permission');
  if (error.response?.status === 401) return showError('notAuthenticated');
  if (error.response?.status === 408) return showError('timeout');

  // Erro de conexão
  if (error.code === 'ECONNABORTED' || !navigator.onLine) {
    return showError('networkError');
  }

  // Mensagem customizada do backend
  if (error.response?.data?.message) {
    return showError(defaultKey, error.response.data.message);
  }

  if (error.message) {
    return showError(defaultKey, error.message);
  }

  return showError(defaultKey);
}

/**
 * Previne clique duplo em botões críticos
 */
export function preventDoubleClick(fn, delay = 500) {
  let lastClick = 0;

  return (...args) => {
    const now = Date.now();
    if (now - lastClick < delay) return;
    lastClick = now;
    return fn(...args);
  };
}

export const toastMessages = {
  saved: () => showSuccess('saved'),
  sent: () => showSuccess('sent'),
  created: () => showSuccess('created'),
  recorded: () => showSuccess('recorded'),
  deleted: () => showSuccess('deleted'),
  approved: () => showSuccess('approved'),
  returned: () => showSuccess('returned'),
  linked: () => showSuccess('linked'),
  exported: () => showSuccess('exported'),
  backup: () => showSuccess('backup'),
  loggedIn: () => showSuccess('loggedIn'),
  copied: () => showSuccess('copied'),
  updated: () => showSuccess('updated'),
  unlinked: () => showSuccess('unlinked'),

  error: (msg) => showError('error', msg),
  saveFailed: (msg) => showError('saveFailed', msg),
  sendFailed: (msg) => showError('sendFailed', msg),
  deleteFailed: (msg) => showError('deleteFailed', msg),
  createFailed: (msg) => showError('createFailed', msg),
  updateFailed: (msg) => showError('updateFailed', msg),
  uploadFailed: (msg) => showError('uploadFailed', msg),
  exportFailed: (msg) => showError('exportFailed', msg),
  loginFailed: (msg) => showError('loginFailed', msg),

  permission: () => showError('permission'),
  notAuthenticated: () => showError('notAuthenticated'),
  sessionExpired: () => showError('sessionExpired'),

  networkError: () => showError('networkError'),
  timeout: () => showError('timeout'),

  requiredFields: () => showError('requiredFields'),
  invalidEmail: () => showError('invalidEmail'),
  passwordMismatch: () => showError('passwordMismatch'),
  passwordTooShort: () => showError('passwordTooShort'),

  fileFailed: (msg) => showError('fileFailed', msg),
  fileTooBig: () => showError('fileTooBig'),
  invalidFileType: () => showError('invalidFileType'),

  info: (msg) => showInfo(msg),
  warning: (msg) => showWarning(msg),
};