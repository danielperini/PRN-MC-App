import { dispatchContextualNotification } from './notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export function notifyDirectMessage(message, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.MESSAGE_DIRECT,
    entityType: 'SystemMessage',
    entity: message,
    actor,
    actionPath: '/Mensagens',
  });
}
