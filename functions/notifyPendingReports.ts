import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Automação executada como serviço, não necessita autenticação de usuário
    const isServiceRole = !await base44.auth.isAuthenticated().catch(() => false);

    // Get all professionals
    const professionals = await base44.asServiceRole.entities.User.filter(
      { role: 'PROFISSIONAL' },
      '-created_date',
      500
    );

    const currentMonth = new Date().toLocaleString('pt-BR', { month: 'long' })
      .charAt(0).toUpperCase() + new Date().toLocaleString('pt-BR', { month: 'long' }).slice(1);
    const currentYear = new Date().getFullYear();
    const today = new Date().getDate();

    // Only notify if still within the 10-day deadline
    if (today > 10) {
      return Response.json({ message: 'Deadline has passed' });
    }

    for (const prof of professionals) {
      // Check if user is exempted this month
      const exemption = await base44.asServiceRole.entities.ReportExemption.filter(
        {
          user_email: prof.email,
          mes_referencia: currentMonth,
          ano: currentYear,
        },
        '-created_date',
        1
      );

      if (exemption && exemption.length > 0) {
        continue; // Skip exempted users
      }

      // Check if they already submitted a report this month
      const existingReport = await base44.asServiceRole.entities.Report.filter(
        {
          created_by: prof.email,
          mes_referencia: currentMonth,
          ano: currentYear,
        },
        '-created_date',
        1
      );

      if (!existingReport || existingReport.length === 0) {
        // Check if notification was already sent
        const existingNotif = await base44.asServiceRole.entities.Notification.filter(
          {
            user_email: prof.email,
            type: 'REPORT_NEEDS_ATTENTION',
            created_date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
          },
          '-created_date',
          1
        );

        if (!existingNotif || existingNotif.length === 0) {
          const daysLeft = 10 - today;
          await base44.asServiceRole.entities.Notification.create({
            user_email: prof.email,
            type: 'REPORT_NEEDS_ATTENTION',
            title: '📋 Lembrete: Relatório mensal pendente',
            message: `Você tem ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} para enviar seu relatório de ${currentMonth}/${currentYear}.`,
            read: false,
            email_sent: false,
          });
        }
      }
    }

    return Response.json({ success: true, notified: professionals.length });
  } catch (error) {
    console.error('Error in notifyPendingReports:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});