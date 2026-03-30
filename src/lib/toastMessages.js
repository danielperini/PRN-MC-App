import { toast } from 'sonner';

/**
 * Biblioteca padronizada de mensagens de toast
 * Padrão: Português brasileiro, frases curtas e diretas
 */

export const toastMessages = {
  // ✅ SUCESSO
  saveSuccess: () => toast.success('Salvo com sucesso.'),
  sendSuccess: () => toast.success('Enviado com sucesso.'),
  updateSuccess: () => toast.success('Atualizado com sucesso.'),
  deleteSuccess: () => toast.success('Excluído com sucesso.'),
  approveSuccess: () => toast.success('Aprovado com sucesso.'),
  rejectSuccess: () => toast.success('Recusado com sucesso.'),
  fileUploadSuccess: () => toast.success('Arquivo enviado com sucesso.'),
  pdfGenerateSuccess: () => toast.success('PDF gerado com sucesso.'),
  syncSuccess: () => toast.success('Sincronização concluída com sucesso.'),
  importSuccess: () => toast.success('Importação concluída com sucesso.'),
  copySuccess: () => toast.success('Copiado com sucesso.'),
  linkSuccess: () => toast.success('Vinculado com sucesso.'),
  publishSuccess: () => toast.success('Publicado com sucesso.'),
  createSuccess: () => toast.success('Criado com sucesso.'),

  // ❌ ERRO
  saveFailed: (error) => 
    toast.error(`Não foi possível salvar.${error ? ` Erro: ${error}` : ''}`),
  sendFailed: (error) => 
    toast.error(`Não foi possível enviar.${error ? ` Erro: ${error}` : ''}`),
  updateFailed: (error) => 
    toast.error(`Não foi possível atualizar.${error ? ` Erro: ${error}` : ''}`),
  deleteFailed: (error) => 
    toast.error(`Não foi possível excluir.${error ? ` Erro: ${error}` : ''}`),
  approveFailed: (error) => 
    toast.error(`Não foi possível aprovar.${error ? ` Erro: ${error}` : ''}`),
  rejectFailed: (error) => 
    toast.error(`Não foi possível recusar.${error ? ` Erro: ${error}` : ''}`),
  fileUploadFailed: (error) => 
    toast.error(`Não foi possível enviar o arquivo.${error ? ` Erro: ${error}` : ''}`),
  pdfGenerateFailed: (error) => 
    toast.error(`Não foi possível gerar o PDF.${error ? ` Erro: ${error}` : ''}`),
  syncFailed: (error) => 
    toast.error(`Não foi possível sincronizar.${error ? ` Erro: ${error}` : ''}`),
  importFailed: (error) => 
    toast.error(`Não foi possível importar.${error ? ` Erro: ${error}` : ''}`),
  linkFailed: (error) => 
    toast.error(`Não foi possível vincular.${error ? ` Erro: ${error}` : ''}`),
  publishFailed: (error) => 
    toast.error(`Não foi possível publicar.${error ? ` Erro: ${error}` : ''}`),
  createFailed: (error) => 
   toast.error(`Erro ao processar.${error ? ` ${error}` : ''}`),
  permissionDenied: () => 
   toast.error('Você não tem permissão para realizar esta ação.'),
  validationError: (message) => 
    toast.error(message || 'Por favor, verifique os dados informados.'),

  // ⚠️ AVISOS
  warning: (message) => toast.warning(message),
  info: (message) => toast.info(message),
};