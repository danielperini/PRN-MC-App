import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId, authorEmail, authorName, status } = await req.json();

    if (!reportId || !authorEmail || !status) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Cria notificação para o autor do relatório
    if (status === 'APPROVED') {
      await base44.asServiceRole.entities.Notification.create({
        user_email: authorEmail,
        type: 'REPORT_APPROVED',
        title: 'Relatório Aprovado',
        message: `Seu relatório foi aprovado com sucesso.`,
        report_id: reportId,
        read: false,
      });
    } else if (status === 'RETURNED') {
      await base44.asServiceRole.entities.Notification.create({
        user_email: authorEmail,
        type: 'REPORT_RETURNED',
        title: 'Relatório Devolvido',
        message: `Seu relatório foi devolvido para revisão.`,
        report_id: reportId,
        read: false,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});