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
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_PAID,
    entityType: 'PurchaseRequest',
    entity: { ...purchase, action_url: proofRequestUrl },
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
