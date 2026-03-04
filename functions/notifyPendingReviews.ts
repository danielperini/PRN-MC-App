import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Automação executada como serviço, não necessita autenticação de usuário

    // Get all coordinators
    const coordinators = await base44.asServiceRole.entities.User.filter(
      { role: 'COORDENADOR' },
      '-created_date',
      500
    );

    // Get submitted reports
    const submittedReports = await base44.asServiceRole.entities.Report.filter(
      { status: 'SUBMITTED' },
      '-created_date',
      100
    );

    // Get pending user registrations
    const pendingRegistrations = await base44.asServiceRole.entities.UserRegistration.filter(
      { status: 'PENDENTE' },
      '-created_date',
      100
    );

    // Notify each coordinator
    for (const coordinator of coordinators) {
      const reportCount = submittedReports.length;
      const regCount = pendingRegistrations.length;

      if (reportCount > 0) {
        const existingNotif = await base44.asServiceRole.entities.Notification.filter(
          {
            user_email: coordinator.email,
            type: 'REPORT_SUBMITTED',
            created_date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
          },
          '-created_date',
          1
        );

        if (!existingNotif || existingNotif.length === 0) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: coordinator.email,
            type: 'REPORT_SUBMITTED',
            title: `📊 ${reportCount} relatório${reportCount > 1 ? 's' : ''} aguardando revisão`,
            message: `Você tem ${reportCount} relatório${reportCount > 1 ? 's' : ''} enviado${reportCount > 1 ? 's' : ''} aguardando sua revisão.`,
            read: false,
            email_sent: false,
          });
        }
      }

      if (regCount > 0) {
        const existingNotif = await base44.asServiceRole.entities.Notification.filter(
          {
            user_email: coordinator.email,
            type: 'USER_APPROVED',
            created_date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
          },
          '-created_date',
          1
        );

        if (!existingNotif || existingNotif.length === 0) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: coordinator.email,
            type: 'USER_APPROVED',
            title: `👥 ${regCount} solicitação${regCount > 1 ? 's' : ''} de acesso pendente${regCount > 1 ? 's' : ''}`,
            message: `Você tem ${regCount} solicitação${regCount > 1 ? 's' : ''} de acesso de usuário${regCount > 1 ? 's' : ''} aguardando aprovação.`,
            read: false,
            email_sent: false,
          });
        }
      }
    }

    const reportCount = submittedReports.length;
    const regCount = pendingRegistrations.length;
    
    return Response.json({
      success: true,
      coordinators_notified: coordinators.length,
      reports_count: reportCount,
      registrations_count: regCount,
    });
  } catch (error) {
    console.error('Error in notifyPendingReviews:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});