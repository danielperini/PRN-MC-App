import { dispatchContextualNotification } from './notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export function notifyPurchaseCreated(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_CREATED,
    entityType: 'PurchaseRequest',
    entity: purchase,
    actor,
    actionPath: '/Compras',
  });
}

export function notifyPurchaseApproved(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_APPROVED,
    entityType: 'PurchaseRequest',
    entity: purchase,
    actor,
    actionPath: '/Compras',
  });
}

export function notifyPurchaseReturned(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_RETURNED,
    entityType: 'PurchaseRequest',
    entity: purchase,
    actor,
    actionPath: '/Compras',
  });
}

export function notifyPurchaseRejected(purchase, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.PURCHASE_REJECTED,
    entityType: 'PurchaseRequest',
    entity: purchase,
    actor,
    actionPath: '/Compras',
  });
}
