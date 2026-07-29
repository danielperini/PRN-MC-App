import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://museuscentro.base44.app';

function buildEmailHtml(purchase, motivo) {
  const nfNum = purchase.nf_numero ? `NF ${purchase.nf_numero}` : 'Nota Fiscal';
  const fornecedor = purchase.fornecedor_nome || purchase.nf_emitente_nome || '—';
  const valor = purchase.valor_solicitado
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(purchase.valor_solicitado)
    : '—';
  const appLink = `${APP_URL}/Compras?id=${purchase.id}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Nota Fiscal Devolvida</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1a;padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#999;letter-spacing:2px;text-transform:uppercase;">VIADUTO DAS ARTES</p>
          <p style="margin:6px 0 0;font-size:18px;color:#fff;font-weight:700;">Museus Centro</p>
        </td></tr>
        <tr><td style="background:#ef4444;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:15px;color:#fff;font-weight:700;">🔴 Nota Fiscal Devolvida — Ação Necessária</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
            Sua nota fiscal foi devolvida pela coordenação e precisa de correção antes de ser reaprovada.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #e5e5e5;margin-bottom:20px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Dados da Solicitação</p>
              <p style="margin:0 0 4px;font-size:14px;color:#333;"><strong>${nfNum}</strong></p>
              <p style="margin:0 0 4px;font-size:13px;color:#666;">Fornecedor: ${fornecedor}</p>
              <p style="margin:0;font-size:13px;color:#666;">Valor: <strong>${valor}</strong></p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff3f3;border-radius:8px;border:1px solid #fecaca;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:12px;color:#dc2626;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Motivo da Devolução</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">${motivo}</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${appLink}" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">
                Abrir e Corrigir →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #e5e5e5;text-align:center;">
          <p style="margin:0;font-size:11px;color:#999;">Mensagem automática do sistema Museus Centro. Não responda este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { purchase_id, motivo } = body;

    if (!purchase_id || !motivo) {
      return Response.json({ success: false, error: 'purchase_id e motivo são obrigatórios' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id).catch(() => null);
    if (!purchase) {
      return Response.json({ success: false, error: 'Solicitação não encontrada' }, { status: 404 });
    }

    const authorEmail = purchase.created_by || purchase.user_email || purchase.requester_email || null;
    if (!authorEmail) {
      return Response.json({ success: false, error: 'E-mail do autor não encontrado' }, { status: 422 });
    }

    const nfNum = purchase.nf_numero ? `NF ${purchase.nf_numero}` : 'Nota Fiscal';
    const fornecedor = purchase.fornecedor_nome || purchase.nf_emitente_nome || '';
    const docLabel = [nfNum, fornecedor].filter(Boolean).join(' — ');
    const appLink = `${APP_URL}/Compras?id=${purchase_id}`;

    // 1. Criar Notification no sistema
    let notifId = null;
    try {
      const notif = await base44.asServiceRole.entities.Notification.create({
        user_email: authorEmail,
        type: 'NF_DEVOLVIDA',
        title: 'Nota Fiscal devolvida — ação necessária',
        message: `${docLabel}\n\nMotivo: ${motivo}`,
        entity_type: 'PurchaseRequest',
        entity_id: purchase_id,
        action_url: appLink,
        read: false,
        resolved: false,
        email_sent: false,
      });
      notifId = notif?.id || null;
    } catch (e) {
      console.warn('[notifyNFDevolvida] Falha ao criar Notification:', e.message);
    }

    // 2. Enviar e-mail apenas para usuários registrados
    let emailSent = false;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: authorEmail }).catch(() => []);
      if ((users || []).length > 0) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: authorEmail,
          subject: '🔴 Nota Fiscal devolvida — ação necessária',
          body: buildEmailHtml(purchase, motivo),
        });
        emailSent = true;
        if (notifId) {
          await base44.asServiceRole.entities.Notification.update(notifId, { email_sent: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[notifyNFDevolvida] Falha ao enviar e-mail:', e.message);
    }

    return Response.json({ success: true, notif_created: !!notifId, email_sent: emailSent, recipient: authorEmail });
  } catch (err) {
    console.error('[notifyNFDevolvida] Erro:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});