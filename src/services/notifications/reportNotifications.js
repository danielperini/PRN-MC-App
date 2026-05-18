import { dispatchContextualNotification } from './notificationEngine';
import { NOTIFICATION_EVENTS } from '@/utils/notifications/notificationRules';

export function notifyReportSubmitted(report, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.REPORT_SUBMITTED,
    entityType: 'Report',
    entity: report,
    actor,
    actionPath: '/CoordReview',
  });
}

export function notifyReportApproved(report, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.REPORT_APPROVED,
    entityType: 'Report',
    entity: report,
    actor,
    actionPath: '/Relatorios',
  });
}

export function notifyReportReturned(report, actor) {
  return dispatchContextualNotification({
    eventType: NOTIFICATION_EVENTS.REPORT_RETURNED,
    entityType: 'Report',
    entity: report,
    actor,
    actionPath: '/Relatorios',
  });
}
