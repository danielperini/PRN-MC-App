import { base44 } from '@/api/base44Client';
import { getNotificationRecipients } from '@/utils/notifications/notificationRecipients';
import { buildActionUrl, getNotificationTemplate } from '@/utils/notifications/notificationTemplates';
import { buildNotificationHash, findExistingNotification, writeNotificationAudit } from '@/utils/notifications/notificationAudit';
import { isAdministrativeNoise, normalizeEmail, shouldNotifyByEmail } from '@/utils/notifications/notificationRules';

async function getPreference(email) {
  try {
    const records = await base44.entities.NotificationPreference?.filter?.({ user_email: email });
    return records?.[0] || null;
  } catch {
    return null;
  }
}

function preferenceAllowsEmail(preference, recipient) {
  if (recipient.mandatory) return true;
  if (!preference) return true;
  if (preference.receive_email_notifications === false) return false;
  if (preference.email_frequency === 'disabled') return false;
  if (recipient.category && preference.notification_categories?.[recipient.category] === false) return false;
  return true;
}

function preferenceAllowsInApp(preference, recipient) {
  if (!preference) return true;
  if (preference.receive_in_app === false) return false;
  if (recipient.category && preference.notification_categories?.[recipient.category] === false && !recipient.mandatory) return false;
  return true;
}

async function createInAppNotification({ recipient, eventType, entityType, entity, template, actionUrl, emailRequested }) {
  if (!base44.entities.Notification?.create) return null;
  return base44.entities.Notification.create({
    user_email: recipient.email,
    type: eventType,
    category: recipient.category,
    title: template.title,
    message: template.message,
    action_url: actionUrl,
    entity_type: entityType,
    entity_id: entity?.id || entity?._id || '',
    read: false,
    email_sent: false,
    email_requested: emailRequested,
    reason: recipient.reason,
  });
}

async function requestEmailDelivery({ recipient, eventType, entityType, entity, template, actionUrl }) {
  const payload = {
    to: recipient.email,
    recipientEmail: recipient.email,
    subject: template.title,
    title: template.title,
    message: template.message,
    action_url: actionUrl,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entity?.id || entity?._id || '',
  };

  const functionNames = ['sendContextualEmailNotification', 'sendEmailNotification', 'sendNotificationEmail'];
  for (const functionName of functionNames) {
    try {
      const result = await base44.functions.invoke(functionName, payload);
      if (result?.data?.success || result?.success) return { success: true, provider: functionName };
    } catch (_) {}
  }

  return { success: false, provider: 'queued_in_app' };
}

export async function dispatchContextualNotification({
  eventType,
  entityType,
  entity = {},
  actor = {},
  actionPath = '',
  channels = ['email', 'in_app'],
} = {}) {
  if (!eventType || isAdministrativeNoise(eventType)) return { sent: [], skipped: [] };

  const recipients = getNotificationRecipients(eventType, entity, actor);
  const sent = [];
  const skipped = [];
  const entityId = entity.id || entity._id || '';
  const actionUrl = buildActionUrl(entity, actionPath);

  for (const recipient of recipients) {
    const email = normalizeEmail(recipient.email);
    if (!email) continue;

    const hash = buildNotificationHash({ eventType, entityType, entityId, recipientEmail: email });
    const existing = await findExistingNotification(hash);
    if (existing) {
      skipped.push({ email, reason: 'duplicate' });
      await writeNotificationAudit({
        hash,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        recipient_email: email,
        actor_email: normalizeEmail(actor.email || actor.user_email),
        reason: recipient.reason,
        status: 'duplicate_skipped',
      });
      continue;
    }

    const template = getNotificationTemplate(eventType, entity, recipient);
    if (!template) {
      skipped.push({ email, reason: 'no_template' });
      continue;
    }

    const preference = await getPreference(email);
    const wantsEmail = channels.includes('email') && shouldNotifyByEmail(eventType) && preferenceAllowsEmail(preference, recipient);
    const wantsInApp = channels.includes('in_app') && preferenceAllowsInApp(preference, recipient);

    let emailResult = { success: false, provider: 'not_requested' };
    let inApp = null;

    try {
      if (wantsInApp) {
        inApp = await createInAppNotification({ recipient, eventType, entityType, entity, template, actionUrl, emailRequested: wantsEmail });
      }
      if (wantsEmail) {
        emailResult = await requestEmailDelivery({ recipient, eventType, entityType, entity, template, actionUrl });
      }

      await writeNotificationAudit({
        hash,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        recipient_email: email,
        actor_email: normalizeEmail(actor.email || actor.user_email),
        reason: recipient.reason,
        category: recipient.category,
        channel_email: wantsEmail,
        channel_in_app: wantsInApp,
        email_provider: emailResult.provider,
        notification_id: inApp?.id || '',
        status: emailResult.success || inApp ? 'sent_or_queued' : 'skipped_by_preferences',
      });

      sent.push({ recipient_email: email, reason: recipient.reason, email_requested: wantsEmail, in_app: wantsInApp });
    } catch (error) {
      skipped.push({ email, reason: 'error', error: error.message });
      await writeNotificationAudit({
        hash,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        recipient_email: email,
        actor_email: normalizeEmail(actor.email || actor.user_email),
        reason: recipient.reason,
        status: 'error',
        error: error.message,
      });
    }
  }

  return { sent, skipped };
}
