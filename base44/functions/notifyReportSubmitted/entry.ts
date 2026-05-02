import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { reportId } = await req.json();

    if (!reportId) {
      return Response.json({ error: 'reportId obrigatório' }, { status: 400 });
    }

    const report = await base44.asServiceRole.entities.Report.get(reportId);
    if (!report) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://museus-centro.app';
    const linkRelatorio = `${appUrl}/Relatorios?id=${reportId}`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // Email para COORDENADORES
    const coordEmails = [
      'danielperini.mc@viadutodasartes.org.br',
      'danie@periniprojetos.com.br',
    ].filter(e => { if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; } return true; });

    const coordHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #1f2937;">📝 Novo Relatório Submetido para Revisão</h2>
        <p style="color: #555;">
          <strong>${report.author_name}</strong> (${report.funcao}) enviou seu relatório de ${report.mes_referencia}/${report.ano}.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb;">
          <tbody>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; width: 150px; border: 1px solid #e5e7eb;">Profissional</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${report.author_name}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Museu</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${report.museu || '-'}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Período</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${report.mes_referencia}/${report.ano}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkRelatorio}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Revisar Relatório
          </a>
        </div>
      </div>
    `;

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: coordEmails,
        subject: `[Relatório] ${report.mes_referencia}/${report.ano} - ${report.author_name}`,
        html: coordHtml,
      });
    } catch (e) {
      console.error('Erro ao enviar email coordenadores:', e.message);
    }

    // Email para USUÁRIO (confirmação)
    const userHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #16a34a;">✅ Seu Relatório Foi Enviado</h2>
        <p style="color: #555;">
          Seu relatório de <strong>${report.mes_referencia}/${report.ano}</strong> foi enviado com sucesso para revisão da coordenação.
        </p>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkRelatorio}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Acompanhar Status
          </a>
        </div>
      </div>
    `;

    try {
      if (user.email === ALLOWED_EMAIL) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: [user.email],
          subject: '✅ Seu relatório foi enviado',
          html: userHtml,
        });
      } else {
        console.log('Email bloqueado (usuário confirmação):', user.email);
      }
    } catch (e) {
      console.error('Erro ao enviar email usuário:', e.message);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});