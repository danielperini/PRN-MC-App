import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all users with must_submit_monthly_reports = true
    const permissions = await base44.entities.UserPermission.filter({ must_submit_monthly_reports: true });
    
    if (permissions.length === 0) {
      return Response.json({ message: 'No users require monthly reports' });
    }

    // Get current month/year
    const now = new Date();
    const mes = now.toLocaleDateString('pt-BR', { month: 'long' });
    const ano = now.getFullYear();

    // Send notifications
    const results = [];
    for (const perm of permissions) {
      try {
        // Create notification
        await base44.entities.Notification.create({
          user_email: perm.user_email,
          type: 'REPORT_NEEDS_ATTENTION',
          title: 'Relatório Mensal Obrigatório',
          message: `Lembrete: você deve enviar seu relatório mensal referente a ${mes} de ${ano}. Este é o último dia do mês.`,
          action_url: '/app/ReportEditor',
          email_sent: false
        });

        // Send email notification
        await base44.functions.invoke('sendMonthlyReportNotification', {
          user_email: perm.user_email,
          user_name: perm.user_name,
          mes,
          ano
        });

        results.push({ email: perm.user_email, status: 'success' });
      } catch (error) {
        results.push({ email: perm.user_email, status: 'error', error: error.message });
      }
    }

    return Response.json({ 
      message: 'Notificações enviadas',
      total: permissions.length,
      results 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});