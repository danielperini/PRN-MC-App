import { dispatchContextualNotification } from '@/services/notifications/notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export async function notifyUser(email, { title, message, type = NOTIFICATION_EVENTS.MESSAGE_DIRECT, action_url = '', entity = {} }) {
  return dispatchContextualNotification({
    eventType: type,
    entityType: entity.entity_type || 'DirectNotification',
    entity: {
      ...entity,
      id: entity.id || `${type}-${email}`,
      user_email: email,
      title,
      message,
      action_url,
    },
    actor: entity.actor || {},
    actionPath: action_url,
  });
}

export async function notifyCoordinators({ title, message, type = NOTIFICATION_EVENTS.PURCHASE_CREATED, action_url = '', entity = {}, actor = {} }) {
  return dispatchContextualNotification({
    eventType: type,
    entityType: entity.entity_type || 'CoordinatorNotification',
    entity: {
      ...entity,
      id: entity.id || `${type}-critical-coordinators`,
      title,
      message,
      action_url,
    },
    actor,
    actionPath: action_url,
  });
}
