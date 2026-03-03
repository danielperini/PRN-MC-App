import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { report_id, status, reviewer_name } = await req.json();

    if (!report_id || !status) {
      return Response.json({ error: 'report_id and status required' }, { status: 400 });
    }

    const report = await base44.entities.Report.get(report_id);
    if (!report) {
      return Response.json({ error: 'Report not found' }, { status: 404 });
    }

    const author_email = report.created_by;
    let title = '';
    let message = '';

    if (status === 'APPROVED') {
      title = '✅ Relatório Aprovado';
      message = `Seu relatório de ${report.mes_referencia}/${report.ano} foi aprovado${
        reviewer_name ? ` por ${reviewer_name}` : ''
      }.`;
    } else if (status === 'RETURNED') {
      title = '⚠️ Relatório Devolvido';
      message = `Seu relatório de ${report.mes_referencia}/${report.ano} foi devolvido para revisão. ${
        report.return_comment ? `Comentário: ${report.return_comment}` : ''
      }`;
    } else if (status === 'IN_REVIEW') {
      title = '👁️ Relatório em Revisão';
      message = `Seu relatório de ${report.mes_referencia}/${report.ano} está sendo revisado${
        reviewer_name ? ` por ${reviewer_name}` : ''
      }.`;
    }

    if (title && message) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: author_email,
        type: `REPORT_${status}`,
        title,
        message,
        report_id,
        action_url: `/report-editor?id=${report_id}`,
        read: false,
        email_sent: false,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error in notifyReportStatus:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});