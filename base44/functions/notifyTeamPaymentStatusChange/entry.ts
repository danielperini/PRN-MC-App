import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

const NOTIFY_ADMIN_EMAILS = [
  'notasfiscais@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
];

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

    if (!requester_email) {
      return Response.json({ error: 'requester_email obrigatório' }, { status: 400 });
    }

    const normalizedStatus = String(status || '').toUpperCase();
    const appUrl = app_link || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
    const statusLabel = getStatusLabel(normalizedStatus);
    const competencia = `${mes || '-'}/${ano || '-'}`;
    const valorFmt = formatBRL(valor);

    const subject = `[Museus Centro] ${statusLabel} — ${team_member_name || 'Membro'} — ${competencia}`;

    const bodyBase = `Olá,

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

Atenciosamente,
Museus Centro`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    if (requester_email === ALLOWED_EMAIL) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: requester_email,
        subject,
        body: bodyBase,
        from_name: 'Museus Centro',
      });
    } else {
      console.log('Email bloqueado (solicitante):', requester_email);
    }

    const notifyAdminsStatuses = ['APROVADO_COORD', 'DEVOLVIDO_REVISAO', 'RECUSADO', 'PAGO'];

    if (notifyAdminsStatuses.includes(normalizedStatus)) {
      for (const email of NOTIFY_ADMIN_EMAILS) {
        if (email !== requester_email) {
          if (email !== ALLOWED_EMAIL) { console.log('Email bloqueado (admin):', email); continue; }
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            subject,
            body: bodyBase,
            from_name: 'Museus Centro',
          });
        }
      }
    }

    return Response.json({
      success: true,
      payment_id: payment_id || null,
      status: normalizedStatus || null,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});