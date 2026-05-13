import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

function formatBRL(v: unknown) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusLabel(status: unknown) {
  const s = String(status || '').toUpperCase();
  if (s === 'PAGO') return 'Pagamento realizado ✓';
  if (s === 'APROVADO_COORD') return 'Aprovado pela coordenação ✓';
  if (s === 'DEVOLVIDO_REVISAO') return 'Devolvido para revisão ⚠';
  if (s === 'RECUSADO') return 'Recusado ✗';
  return String(status || 'Status atualizado');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      payment_id,
      status,
      requester_email,
      team_member_name,
      mes,
      ano,
      valor,
      observacoes,
      nota_fiscal_url,
      xml_url,
      app_link,
    } = payload || {};

    const normalizedStatus = String(status || '').toUpperCase();
    const appUrl = app_link || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
    const statusLabel = getStatusLabel(normalizedStatus);
    const competencia = `${mes || '-'}/${ano || '-'}`;
    const valorFmt = formatBRL(valor);

    if (requester_email && String(requester_email).toLowerCase() !== ALLOWED_EMAIL) {
      console.log('Notificação ao solicitante bloqueada por política global:', requester_email);
    }

    const subject = `[Museus Centro] ${statusLabel} — ${team_member_name || 'Membro'} — ${competencia}`;

    const body = `Olá,

O status do envio mensal foi atualizado.

Solicitante: ${team_member_name || '-'}
Competência: ${competencia}
Valor: ${valorFmt}
Novo status: ${statusLabel}
ID do registro: ${payment_id || '-'}
${observacoes ? `\nObservações: ${observacoes}` : ''}

Links:
• App: ${appUrl}
${nota_fiscal_url ? `• PDF: ${nota_fiscal_url}` : ''}
${xml_url ? `• XML: ${xml_url}` : ''}

Política temporária de notificações: envio restrito exclusivamente a ${ALLOWED_EMAIL}.

Atenciosamente,
Museus Centro`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: ALLOWED_EMAIL,
      cc: [],
      bcc: [],
      subject,
      body,
      from_name: 'Museus Centro',
    });

    return Response.json({
      success: true,
      restricted_notifications: true,
      sent_to: [ALLOWED_EMAIL],
      blocked_original_requester: requester_email && String(requester_email).toLowerCase() !== ALLOWED_EMAIL ? requester_email : null,
      payment_id: payment_id || null,
      status: normalizedStatus || null,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});
