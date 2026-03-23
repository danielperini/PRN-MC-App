import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event === 'comment:created') {
      const { reportId, commentAuthorEmail, commentAuthorName, reportAuthorEmail } = data;

      // Busca o relatório para contexto
      const report = await base44.asServiceRole.entities.Report.get(reportId);
      
      if (!report) {
        return Response.json({ error: 'Report not found' }, { status: 404 });
      }

      // Notifica o autor do relatório se não for o mesmo que comentou
      if (reportAuthorEmail !== commentAuthorEmail) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: reportAuthorEmail,
          type: 'COMMENT_ADDED',
          title: `Novo comentário de ${commentAuthorName}`,
          message: `${commentAuthorName} comentou no seu relatório de ${report.mes_referencia}/${report.ano}`,
          report_id: reportId,
          action_url: `/relatorio/${reportId}`,
          email_sent: false,
        });

        // Envia email
        await base44.integrations.Core.SendEmail({
          to: reportAuthorEmail,
          subject: `Novo comentário em seu relatório - ${report.mes_referencia}/${report.ano}`,
          body: `
            <h2>${commentAuthorName} comentou no seu relatório</h2>
            <p>Período: ${report.mes_referencia}/${report.ano}</p>
            <p><a href="https://seu-app.com/relatorio/${reportId}">Ver comentário</a></p>
          `,
        });
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid event' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});