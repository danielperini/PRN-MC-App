import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { reportId, action, reportData } = payload;

    if (!reportId || !action) {
      return Response.json({ error: 'Missing reportId or action' }, { status: 400 });
    }

    // Get user notification preferences
    const prefs = await base44.asServiceRole.entities.NotificationPreference.filter(
      { user_email: reportData?.author_email || user.email },
      '-created_date',
      1
    );

    const preference = prefs?.[0];
    if (!preference) {
      return Response.json({ success: false, message: 'No preference found' });
    }

    // Determine if should send notification based on action and preferences
    let shouldNotify = false;
    let subject = '';
    let body = '';

    const reportMonth = reportData?.mes_referencia || 'Mês';
    const reportYear = reportData?.ano || 'Ano';

    switch (action) {
      case 'APPROVED':
        if (preference.notify_approved) {
          shouldNotify = true;
          subject = `✓ Relatório de ${reportMonth}/${reportYear} foi aprovado`;
          body = `Seu relatório de ${reportMonth}/${reportYear} foi oficialmente aprovado.\n\nMuseu: ${reportData?.museu}\nEquipe: ${reportData?.equipe}`;
        }
        break;
      case 'RETURNED':
        if (preference.notify_returned) {
          shouldNotify = true;
          subject = `↻ Relatório de ${reportMonth}/${reportYear} devolvido para revisão`;
          body = `Seu relatório de ${reportMonth}/${reportYear} foi devolvido para revisão.\n\nComentário: ${reportData?.return_comment || 'Nenhum comentário adicional'}`;
        }
        break;
      case 'PENDING_REMINDER':
        if (preference.notify_pending_reports && preference.reminder_frequency !== 'never') {
          shouldNotify = true;
          subject = `⏰ Lembrança: Relatório de ${reportMonth}/${reportYear} pendente`;
          body = `Você tem um relatório pendente de ${reportMonth}/${reportYear}.\n\nPrazo sugerido: em ${preference.notify_deadline_days} dias`;
        }
        break;
      case 'SUBMITTED':
        if (preference.notify_pending_reports) {
          shouldNotify = true;
          subject = `📤 Relatório de ${reportMonth}/${reportYear} enviado`;
          body = `Seu relatório de ${reportMonth}/${reportYear} foi enviado com sucesso para revisão.`;
        }
        break;
    }

    if (!shouldNotify) {
      return Response.json({ success: false, message: 'Notification skipped by user preference' });
    }

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    const toEmail = reportData?.author_email || user.email;
    if (toEmail !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', toEmail);
      return Response.json({ success: false, message: 'Email bloqueado por política de envio' });
    }
    // Send email via Core integration
    const emailResult = await base44.asServiceRole.integrations.Core.SendEmail({
      to: toEmail,
      subject: subject,
      body: body
    });

    return Response.json({
      success: true,
      action: action,
      emailSent: !!emailResult
    });
  } catch (error) {
    console.error('Error notifying report status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});