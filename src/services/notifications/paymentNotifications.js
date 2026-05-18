import { dispatchContextualNotification } from './notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export function notifyPaymentCompleted(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_PAID,
    entityType: 'PurchaseRequest',
    entity: purchase,
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
