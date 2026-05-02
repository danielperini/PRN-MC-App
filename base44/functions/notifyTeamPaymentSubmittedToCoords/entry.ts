import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { teamPaymentId } = await req.json();

    if (!teamPaymentId) {
      return Response.json({ error: 'teamPaymentId obrigatório' }, { status: 400 });
    }

    const payment = await base44.asServiceRole.entities.TeamPayment.get(teamPaymentId);
    if (!payment) {
      return Response.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://museus-centro.app';
    const linkPagamento = `${appUrl}/GestaoPagamentos?id=${teamPaymentId}`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // Email para COORDENADORES
    const coordEmails = [
      'danielperini.mc@viadutodasartes.org.br',
      'danie@periniprojetos.com.br',
    ].filter(e => { if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; } return true; });

    const coordHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #1f2937;">💰 Novo Pagamento Submetido para Aprovação</h2>
        <p style="color: #555;">
          Uma solicitação de pagamento foi enviada e aguarda sua análise.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb;">
          <tbody>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; width: 150px; border: 1px solid #e5e7eb;">ID</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${teamPaymentId}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Valor</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">R$ ${(payment.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Status</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${payment.status || 'Pendente'}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkPagamento}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Revisar Pagamento
          </a>
        </div>
      </div>
    `;

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: coordEmails,
        subject: `[Pagamento] R$ ${(payment.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        html: coordHtml,
      });
    } catch (e) {
      console.error('Erro ao enviar email coordenadores:', e.message);
    }

    // Email para USUÁRIO (confirmação)
    const userHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #16a34a;">✅ Seu Pagamento Foi Submetido</h2>
        <p style="color: #555;">
          Seu pagamento foi enviado com sucesso para análise. Valor: <strong>R$ ${(payment.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
        </p>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkPagamento}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Acompanhar Status
          </a>
        </div>
      </div>
    `;

    try {
      if (user.email === ALLOWED_EMAIL) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: [user.email],
          subject: '✅ Seu pagamento foi submetido',
          html: userHtml,
        });
      } else {
        console.log('Email bloqueado (usuário):', user.email);
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