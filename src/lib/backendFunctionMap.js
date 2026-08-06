/**
 * Mapa de funções backend canônicas do Museus Centro.
 *
 * REGRA: Todo invoke() no frontend deve referenciar SOMENTE as funções listadas
 * como CANÔNICA abaixo. As funções LEGADAS não devem ser deletadas (podem estar
 * vinculadas a automações), mas não devem ser chamadas diretamente pelo frontend.
 *
 * Domínio                     | CANÔNICA                          | LEGADAS (não invocar)
 * ----------------------------|-----------------------------------|---------------------------------------------------
 * Notificações de compra      | notifyCoordinatorPurchaseSubmitted| notifyCoordinatorOnPurchaseSubmitted,
 *                             |                                   | notifyPurchaseSubmitted, notifyPurchaseForApproval,
 *                             |                                   | notifyOnPurchaseStatusChanged, notifyPurchaseStatusChange,
 *                             |                                   | notifyUserOnPurchaseStatusChange
 * Backup de NFs               | driveBackupPurchase               | backupNotasFiscaisToDrive, syncNotaFiscalDriveBackup,
 *                             |                                   | backupDiarioNFsDrive, backupXmlsESync
 * Sincronização de fotos Drive| syncFotosDriveAutomatico          | importarFotografiaDrive, importarFotografiaDrive2,
 *                             |                                   | syncNovasFotosDriveRelatorios
 * Auditoria de rubricas       | auditRubricas                     | auditRubricasScheduled, auditarRubricasDuplicadas,
 *                             |                                   | corrigirRubricasDuplicadas
 * Geração de PDF de relatório | generateSingleReportPDF           | generateReportPDF, generateReportPDFActivityGallery,
 *                             |                                   | gerarRelatorioCompleto
 * Sincronização Drive geral   | sincronizacaoUniversalDrive       | sincronizarPastasDrive, sincronizacaoFinalDrive,
 *                             |                                   | sincronizacaoDiferencial
 * Processamento de NF         | processarNotaFiscalComClaude      | processarNotaFiscal, extractInvoiceData,
 *                             |                                   | analyzeInvoiceFull, analisarDocumentosUnificado
 * Notificação de status NF    | notifyUserOnPurchaseStatusChange  | notifyOnPurchaseStatusChanged, notifyPurchaseStatusChange
 */

/** Funções canônicas por domínio — use estas constantes em invoke() */
export const FN = {
  // Notificações de compra
  NOTIFY_PURCHASE_SUBMITTED: 'notifyCoordinatorPurchaseSubmitted',
  NOTIFY_PURCHASE_STATUS: 'notifyUserOnPurchaseStatusChange',
  NOTIFY_PURCHASE_APPROVED: 'notifyPurchaseApprovedToFinanceiro',

  // Backup e drive
  BACKUP_PURCHASE_DRIVE: 'driveBackupPurchase',
  SYNC_FOTOS_DRIVE: 'syncFotosDriveAutomatico',
  SYNC_DRIVE_UNIVERSAL: 'sincronizacaoUniversalDrive',

  // Relatórios
  GENERATE_REPORT_PDF: 'generateSingleReportPDF',

  // Rubricas
  AUDIT_RUBRICAS: 'auditRubricas',

  // NF
  PROCESS_NF: 'processarNotaFiscalComClaude',

  // Aprovações
  PROCESS_PURCHASE_APPROVAL: 'processPurchaseApproval',
  PURCHASE_ACTIONS: 'purchaseActions',

  // Conciliação de comprovantes de pagamento
  VINCULAR_COMPROVANTES_LOTE: 'vincularComprovantesEmLote',

  // Sincronizações
  SYNC_BASE_CONHECIMENTO: 'syncBaseConhecimento',
  SYNC_TUTORIAIS: 'sincronizarTutoriaisDrive',
};

export default FN;