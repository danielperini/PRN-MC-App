import { dispatchContextualNotification } from './notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export function notifyPaymentCompleted(purchase, actor) {
  const purchaseId = purchase?.id || '';
  const subject = encodeURIComponent(`Solicitação de comprovante de pagamento — ${purchase?.nf_numero || purchaseId}`);
  const body = encodeURIComponent(
    `Solicito o comprovante de depósito da compra ${purchase?.descricao_item || purchase?.fornecedor_nome || purchaseId}.\n` +
    `Solicitação: https://appgestor.periniprojetos.com.br/Compras?id=${purchaseId}`
  );
  const proofRequestUrl = `mailto:notasfiscais@viadutodasartes.org.br,danielperini.mc@viadutodasartes.org.br,adm@viadutodasartes.org.br?subject=${subject}&body=${body}`;
  const receiptUrl = purchase?.comprovante_pagamento_url || purchase?.comprovante_url || purchase?.payment_receipt_url || purchase?.comprovante_drive_url || '';
  const receiptName = purchase?.comprovante_pagamento_nome || 'comprovante-de-pagamento.pdf';
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_PAID,
    entityType: 'PurchaseRequest',
    entity: {
      ...purchase,
      action_url: receiptUrl ? `https://appgestor.periniprojetos.com.br/Compras?id=${purchaseId}` : proofRequestUrl,
      notification_attachment_url: receiptUrl,
      notification_attachment_name: receiptName,
      comprovante_anexado: Boolean(receiptUrl),
    },
    actor,
    actionPath: '/Compras',
  });
}

export function notifyPaymentProofAttached(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PAYMENT_PROOF_ATTACHED,
    entityType: 'PurchaseRequest',
    entity: purchase,
    actor,
    actionPath: '/Compras',
  });
}
