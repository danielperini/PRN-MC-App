import { base44 } from '@/api/base44Client';

export function buildNotificationHash({ eventType, entityType, entityId, recipientEmail }) {
  return [eventType, entityType, entityId, recipientEmail].map((value) => String(value || '').toLowerCase()).join('|');
}

export async function findExistingNotification(hash) {
  if (!hash) return null;
  try {
    const records = await base44.entities.NotificationAuditLog?.filter?.({ hash });
    if (records?.[0]) return records[0];
  } catch {
    // fallback abaixo
  }
  try {
    const logs = await base44.entities.AuditLog?.filter?.({ action: 'NOTIFICATION_EMAIL' }, '-created_date', 50);
    return (logs || []).find((log) => String(log.details || '').includes(hash)) || null;
  } catch {
    return null;
  }
}

export async function writeNotificationAudit(payload) {
  try {
    if (base44.entities.NotificationAuditLog?.create) {
      return await base44.entities.NotificationAuditLog.create(payload);
    }
    if (base44.entities.AuditLog?.create) {
      return await base44.entities.AuditLog.create({
        action: 'NOTIFICATION_EMAIL',
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        actor_email: payload.actor_email,
        details: `${payload.hash} | ${payload.event_type} -> ${payload.recipient_email}: ${payload.status}`,
        metadata: payload,
      });
    }
  } catch (error) {
    console.warn('Notification audit failed:', error);
  }
  return null;
}
