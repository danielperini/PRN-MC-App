import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

function buildEmailHtml(compra) {
  const valor = compra.valor_pago || compra.valor_aprovado_admin || compra.valor_aprovado || compra.valor_solicitado || 0;
  const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataPag = compra.data_pagamento_efetivo
    ? new Date(compra.data_pagamento_efetivo + 'T00:00:00').toLocaleDateString('pt-BR')
    : compra.data_pagamento
      ? new Date(compra.data_pagamento).toLocaleDateString('pt-BR')
      : '—';
  const descricao = compra.descricao_item || '(sem descrição)';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <!-- Cabeçalho -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 36px;">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Museus Centro · Compras</p>
            <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3;">💳 Pagamento confirmado</h1>
          </td>
        </tr>
        <!-- Corpo -->
        <tr>
          <td style="background:#fff;padding:32px 36px;">
            <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
              O <strong>pagamento da sua solicitação</strong> foi confirmado pelo administrativo-financeiro.
            </p>
            <!-- Card do item -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr><td style="background:#f1f5f9;padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;color:#475569;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Item pago</p>
              </td></tr>
              <tr><td style="padding:20px;">
                <p style="margin:0 0 12px;color:#0f172a;font-size:16px;font-weight:600;">${descricao}</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:13px;">Valor pago</td>
                    <td align="right" style="padding:6px 0;color:#059669;font-size:16px;font-weight:700;">${valorFormatado}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9;">Data do pagamento</td>
                    <td align="right" style="padding:6px 0;color:#334155;font-size:13px;border-top:1px solid #f1f5f9;">${dataPag}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;color:#64748b;font-size:13px;line-height:1.6;">
              Acesse o sistema para verificar os detalhes do pagamento e emitir sua nota fiscal, se ainda não o fez.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="${APP_URL}/Compras" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                  Ver comprovante →
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
        <!-- Rodapé -->
        <tr>
          <td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Museus Centro · Viaduto das Artes</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    // Só dispara quando status mudou para PAGO
    const novoStatus = data?.status;
    const statusAnterior = old_data?.status;

    if (novoStatus !== 'PAGO' || statusAnterior === 'PAGO') {
      return Response.json({ ok: true, message: 'Nenhuma ação necessária.' });
    }

    // Verificar bloqueio global de emails
    let emailPaused = false;
    try {
      const configs = await base44.asServiceRole.entities.MetadadosConfig.filter({ chave: 'email_pausado' });
      if (configs.length > 0 && configs[0].valor === 'true') emailPaused = true;
    } catch (_) { /* sem bloqueio */ }

    if (emailPaused) {
      return Response.json({ ok: true, message: 'Emails pausados globalmente.' });
    }

    const compraId = event?.entity_id || data?.id;
    if (!compraId) {
      return Response.json({ ok: false, message: 'ID da compra não encontrado no evento.' });
    }

    // Buscar compra completa
    const compra = data || await base44.asServiceRole.entities.PurchaseRequest.get(compraId);
    if (!compra) {
      return Response.json({ ok: false, message: 'Compra não encontrada.' });
    }

    const destinatarioId = compra.created_by_id;
    if (!destinatarioId) {
      return Response.json({ ok: false, message: 'Criador da compra não identificado.' });
    }

    // Buscar email do solicitante
    const users = await base44.asServiceRole.entities.User.filter({ id: destinatarioId });
    const user = users[0];
    if (!user?.email) {
      return Response.json({ ok: false, message: 'Usuário não encontrado.' });
    }

    await base44.asServiceRole.integrations.Core.SendEmail({
      from_name: 'Museus Centro — Compras',
      to: user.email,
      subject: `💳 Pagamento confirmado — ${compra.descricao_item || 'Solicitação de compra'}`,
      body: buildEmailHtml(compra),
    });

    return Response.json({ ok: true, email_enviado: user.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});