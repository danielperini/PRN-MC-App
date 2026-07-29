import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const { report_id, author_email, author_name, mes_referencia, museu, reviewer_name } = body;

    if (!report_id || !author_email) {
      return Response.json({ error: 'report_id e author_email são obrigatórios' }, { status: 400 });
    }

    const APP_URL = 'https://app.base44.com';
    const mesMuseu = [mes_referencia, museu].filter(Boolean).join(' — ');

    // Criar notificação no sino
    await base44.asServiceRole.entities.Notification.create({
      user_email: author_email,
      type: 'REPORT_APPROVED',
      title: 'Relatório aprovado',
      message: `${mesMuseu} — aprovado por ${reviewer_name || 'coordenação'}`,
      entity_type: 'Report',
      entity_id: report_id,
      action_url: '/Relatorios',
      read: false,
      resolved: true,
      email_sent: false,
    });

    // Enviar e-mail
    const emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#000000;padding:24px 32px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Museus Centro</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">Olá, <strong>${author_name || 'Profissional'}</strong>,</p>
          <!-- Caixa de aprovação (verde) -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:20px;">✅</span>
              <p style="margin:0;font-size:15px;font-weight:700;color:#15803d;">Relatório Aprovado</p>
            </div>
            <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">${mesMuseu}</p>
            ${reviewer_name ? `<p style="margin:4px 0 0;font-size:13px;color:#166534;">Aprovado por: ${reviewer_name}</p>` : ''}
          </div>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Seu relatório foi aprovado pela coordenação. Você pode acessá-lo na plataforma a qualquer momento para visualizar os detalhes.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${APP_URL}/Relatorios" style="background:#000000;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">
              Ver meus relatórios →
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            Esta mensagem é interna e restrita aos membros e observadores do projeto Museus Centro — Viaduto das Artes.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: author_email,
      subject: `✅ Relatório aprovado — ${mesMuseu}`,
      body: emailBody,
    });

    return Response.json({ success: true, email_sent: true });
  } catch (error) {
    console.error('notifyReportApprovedEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});