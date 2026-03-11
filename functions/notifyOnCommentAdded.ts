import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportId, authorEmail, authorName, commentText } = await req.json();

    if (!reportId || !authorEmail) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Busca o relatório para obter o email do autor
    const report = await base44.asServiceRole.entities.Report.read(reportId);
    if (!report || report.created_by === authorEmail) {
      return Response.json({ success: true }); // Não notifica se é o próprio autor
    }

    // Cria notificação para o autor do relatório
    await base44.asServiceRole.entities.Notification.create({
      user_email: report.created_by,
      type: 'COMMENT_ADDED',
      title: 'Novo Comentário',
      message: `${authorName} adicionou um comentário: "${commentText.substring(0, 50)}..."`,
      report_id: reportId,
      read: false,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});