import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const { purchaseId } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://museus-centro.app';
    const linkCompra = `${appUrl}/Compras?tab=minhas&id=${purchaseId}`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // Email para COORDENADORES
    const coordEmails = [
      'danielperini.mc@viadutodasartes.org.br',
      'danie@periniprojetos.com.br',
    ].filter(e => { if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; } return true; });

    const coordHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #1f2937;">📦 Nova Solicitação de Compra Submetida</h2>
        <p style="color: #555;">
          <strong>${purchase.descricao_item}</strong> foi enviada para aprovação.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb;">
          <tbody>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; width: 150px; border: 1px solid #e5e7eb;">Solicitante</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${user.full_name}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Valor</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">R$ ${(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Categoria</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${purchase.categoria || '-'}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkCompra}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Revisar Compra
          </a>
        </div>
      </div>
    `;

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: coordEmails,
        subject: `[Compra] ${purchase.descricao_item}`,
        html: coordHtml,
      });
    } catch (e) {
      console.error('Erro ao enviar email coordenadores:', e.message);
    }

    // Email para USUÁRIO (confirmação)
    const userHtml = `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
        <h2 style="color: #16a34a;">✅ Sua Solicitação Foi Enviada</h2>
        <p style="color: #555;">
          A solicitação de compra <strong>${purchase.descricao_item}</strong> foi enviada com sucesso para análise.
        </p>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${linkCompra}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Acompanhar Status
          </a>
        </div>
      </div>
    `;

    try {
      if (user.email === ALLOWED_EMAIL) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: [user.email],
          subject: '✅ Solicitação de compra enviada',
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