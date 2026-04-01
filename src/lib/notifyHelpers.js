import { base44 } from '@/api/base44Client';

/**
 * Cria notificação interna para um usuário específico.
 */
export async function notifyUser(email, { title, message, type = 'INVOICE_SUBMITTED', action_url = '' }) {
  try {
    await base44.entities.Notification.create({
      user_email: email,
      type,
      title,
      message,
      action_url,
      read: false,
      email_sent: false,
    });
  } catch (e) {
    console.warn('notifyUser error:', e?.message);
  }
}

/**
 * Notifica todos os coordenadores (base_role === COORDENADOR) e admins com can_review_reports.
 */
export async function notifyCoordinators({ title, message, type = 'INVOICE_SUBMITTED', action_url = '' }) {
  try {
    const permissions = await base44.entities.UserPermission.list();
    const targets = permissions.filter(
      p => p.base_role === 'COORDENADOR' || p.base_role === 'ADMIN' || p.can_review_reports === true
    );
    await Promise.all(
      targets.map(p =>
        base44.entities.Notification.create({
          user_email: p.user_email,
          type,
          title,
          message,
          action_url,
          read: false,
          email_sent: false,
        })
      )
    );
  } catch (e) {
    console.warn('notifyCoordinators error:', e?.message);
  }
}