import { getCriticalCoordinators, normalizeEmail, NOTIFICATION_EVENTS } from './notificationRules';

export function getEntityOwnerEmails(entity = {}) {
  return [
    entity.created_by,
    entity.user_email,
    entity.requester_email,
    entity.solicitante_email,
    entity.email_solicitante,
    entity.author_email,
    entity.owner_email,
    entity.responsible_user,
    entity.responsavel_email,
    entity.report_author,
    entity.report_author_email,
    entity.linked_user,
    entity.user?.email,
  ].map(normalizeEmail).filter(Boolean);
}

export function uniqueRecipients(recipients = []) {
  const map = new Map();
  recipients.forEach((recipient) => {
    const email = normalizeEmail(recipient.email || recipient.user_email);
    if (!email || map.has(email)) return;
    map.set(email, {
      email,
      name: recipient.name || recipient.full_name || recipient.user_name || '',
      reason: recipient.reason || 'direct',
      mandatory: recipient.mandatory === true,
      category: recipient.category || '',
    });
  });
  return Array.from(map.values());
}

function ownerRecipients(entity, reason, category) {
  return getEntityOwnerEmails(entity).map((email) => ({ email, reason, category }));
}

function coordinatorRecipients(reason, category) {
  return getCriticalCoordinators().map((coordinator) => ({
    ...coordinator,
    reason,
    category,
    mandatory: true,
  }));
}

export function getNotificationRecipients(eventType, entity = {}) {
  let recipients = [];

  switch (eventType) {
    case NOTIFICATION_EVENTS.PURCHASE_CREATED:
      recipients = [
        ...coordinatorRecipients('financial_responsibility', 'aprovacoes'),
        ...ownerRecipients(entity, 'own_purchase_confirmation', 'minhas_compras'),
      ];
      break;
    case NOTIFICATION_EVENTS.PURCHASE_APPROVED:
      recipients = [
        ...ownerRecipients(entity, 'own_purchase_status', 'minhas_compras'),
        ...coordinatorRecipients('ready_for_payment', 'financeiro'),
      ];
      break;
    case NOTIFICATION_EVENTS.PURCHASE_RETURNED:
    case NOTIFICATION_EVENTS.PURCHASE_REJECTED:
      recipients = ownerRecipients(entity, 'own_purchase_status', 'minhas_compras');
      break;
    case NOTIFICATION_EVENTS.PURCHASE_PAID:
    case NOTIFICATION_EVENTS.PAYMENT_PROOF_ATTACHED:
      recipients = [
        ...ownerRecipients(entity, 'own_payment_status', 'meus_pagamentos'),
        ...coordinatorRecipients('payment_confirmation', 'financeiro'),
      ];
      break;
    case NOTIFICATION_EVENTS.REPORT_SUBMITTED:
      recipients = [
        ...ownerRecipients(entity, 'own_report_submitted', 'meus_relatorios'),
        ...coordinatorRecipients('pending_report_review', 'aprovacoes'),
      ];
      break;
    case NOTIFICATION_EVENTS.REPORT_APPROVED:
    case NOTIFICATION_EVENTS.REPORT_RETURNED:
      recipients = [
        ...ownerRecipients(entity, 'own_report_status', 'meus_relatorios'),
        ...coordinatorRecipients('report_status_tracking', 'aprovacoes'),
      ];
      break;
    case NOTIFICATION_EVENTS.MESSAGE_DIRECT:
      recipients = ownerRecipients(entity, 'direct_message', 'mensagens');
      break;
    case NOTIFICATION_EVENTS.COMMENT_CREATED:
      recipients = ownerRecipients(entity, 'direct_comment', 'mensagens');
      break;
    default:
      recipients = [];
  }

  return uniqueRecipients(recipients);
}
