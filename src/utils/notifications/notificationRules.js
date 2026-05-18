export const CRITICAL_COORDINATORS = [
  {
    name: 'Daniel Perini',
    email: 'daniel@periniprojetos.com.br',
  },
  {
    name: 'Josiane Amâncio',
    email: 'josiane@periniprojetos.com.br',
  },
];

export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  IN_APP: 'in_app',
  PUSH: 'push',
};

export const NOTIFICATION_CATEGORIES = {
  PURCHASES: 'minhas_compras',
  PAYMENTS: 'meus_pagamentos',
  REPORTS: 'meus_relatorios',
  MESSAGES: 'mensagens',
  APPROVALS: 'aprovacoes',
  FINANCIAL: 'financeiro',
  SYSTEM: 'sistema',
};

export const NOTIFICATION_EVENTS = {
  PURCHASE_CREATED: 'purchase.created',
  PURCHASE_APPROVED: 'purchase.approved',
  PURCHASE_RETURNED: 'purchase.returned',
  PURCHASE_REJECTED: 'purchase.rejected',
  PURCHASE_PAID: 'purchase.paid',
  PAYMENT_PROOF_ATTACHED: 'payment.proof_attached',
  REPORT_SUBMITTED: 'report.submitted',
  REPORT_APPROVED: 'report.approved',
  REPORT_RETURNED: 'report.returned',
  MESSAGE_DIRECT: 'message.direct',
  COMMENT_CREATED: 'comment.created',
};

export const EMAIL_ALLOWED_EVENTS = new Set(Object.values(NOTIFICATION_EVENTS));

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isCriticalCoordinatorEmail(email) {
  const normalized = normalizeEmail(email);
  return CRITICAL_COORDINATORS.some((coordinator) => coordinator.email === normalized);
}

export function getCriticalCoordinators() {
  return CRITICAL_COORDINATORS.map((coordinator) => ({ ...coordinator, email: normalizeEmail(coordinator.email) }));
}

export function shouldNotifyByEmail(eventType) {
  return EMAIL_ALLOWED_EVENTS.has(eventType);
}

export function isAdministrativeNoise(eventType) {
  return [
    'audit.created',
    'system.sync',
    'system.rebuild',
    'technical.upload',
    'dashboard.refresh',
  ].includes(eventType);
}
