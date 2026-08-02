import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

function buildEmailHtml(item) {
  const valor = item.valor_aprovado || item.valor_solicitado || 0;
  const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataAprov = item.aprov_coord_data
    ? new Date(item.aprov_coord_data + 'T00:00:00').toLocaleDateString('pt-BR')
    : '—';
  const coordenador = item.aprov_coord_nome || 'Coordenação';
  const descricao = item.descricao_item || '(sem descrição)';

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
            <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3;">✅ Solicitação aprovada pela coordenação</h1>
          </td>
        </tr>
        <!-- Corpo -->
        <tr>
          <td style="background:#fff;padding:32px 36px;">
            <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
              Sua solicitação de compra foi <strong>aprovada pela coordenação</strong> e está aguardando pagamento pelo administrativo-financeiro.
            </p>
            <!-- Card do item -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr><td style="background:#f1f5f9;padding:12px 20px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;color:#475569;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Item solicitado</p>
              </td></tr>
              <tr><td style="padding:20px;">
                <p style="margin:0 0 12px;color:#0f172a;font-size:16px;font-weight:600;">${descricao}</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:13px;">Valor aprovado</td>
                    <td align="right" style="padding:6px 0;color:#059669;font-size:15px;font-weight:700;">${valorFormatado}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9;">Aprovado por</td>
                    <td align="right" style="padding:6px 0;color:#334155;font-size:13px;font-weight:600;border-top:1px solid #f1f5f9;">${coordenador}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9;">Data de aprovação</td>
                    <td align="right" style="padding:6px 0;color:#334155;font-size:13px;border-top:1px solid #f1f5f9;">${dataAprov}</td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <p style="margin:0 0 24px;color:#64748b;font-size:13px;line-height:1.6;">
              O pagamento será processado pelo administrativo-financeiro em breve. Você receberá outra notificação quando o pagamento for confirmado.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="${APP_URL}/Compras" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                  Ver solicitação →
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

    // Verificar bloqueio global de emails
    let emailPaused = false;
    try {
      const configs = await base44.asServiceRole.entities.MetadadosConfig.filter({ chave: 'email_pausado' });
      if (configs.length > 0 && configs[0].valor === 'true') emailPaused = true;
    } catch (_) { /* sem bloqueio configurado */ }

    if (emailPaused) {
      return Response.json({ ok: true, message: 'Emails pausados globalmente. Nenhum envio realizado.' });
    }

    // Buscar compras aprovadas pela coord ainda não notificadas
    let pendentes = [];
    try {
      pendentes = await base44.asServiceRole.entities.PurchaseRequest.filter({
        status: 'APROVADO_COORD',
        notificado_aprovacao_coord: false,
      });
    } catch (_) { /* campo ainda não existe — buscar por status apenas */ }

    // Fallback: buscar por status e filtrar no código
    if (!pendentes || pendentes.length === 0) {
      const todas = await base44.asServiceRole.entities.PurchaseRequest.filter({ status: 'APROVADO_COORD' });
      pendentes = todas.filter(p => !p.notificado_aprovacao_coord);
    }

    const resultados = [];
    const agora = new Date().toISOString();

    for (const compra of pendentes) {
      const destinatario = compra.created_by_id;
      if (!destinatario) {
        resultados.push({ id: compra.id, status: 'sem_destinatario' });
        continue;
      }

      try {
        // Buscar email do usuário criador
        const users = await base44.asServiceRole.entities.User.filter({ id: destinatario });
        const user = users[0];
        if (!user?.email) {
          resultados.push({ id: compra.id, status: 'usuario_nao_encontrado' });
          continue;
        }

        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: 'Museus Centro — Compras',
          to: user.email,
          subject: `✅ Sua solicitação foi aprovada pela coordenação — aguardando pagamento`,
          body: buildEmailHtml(compra),
        });

        await base44.asServiceRole.entities.PurchaseRequest.update(compra.id, {
          notificado_aprovacao_coord: true,
          notificado_aprovacao_coord_em: agora,
        });

        resultados.push({ id: compra.id, status: 'enviado', email: user.email });
      } catch (err) {
        resultados.push({ id: compra.id, status: 'erro', error: err.message });
      }
    }

    return Response.json({
      ok: true,
      total_pendentes: pendentes.length,
      resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});