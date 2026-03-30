import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatBRL(v) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NOTIFY_EMAILS = [
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
      payment_id, team_member_name, cargo, mes, ano, valor,
      user_email, requester_email,
      nota_fiscal_url, xml_url, nota_fiscal_file_name, xml_file_name,
      app_link,
    } = payload || {};

    const appUrl = app_link || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
    const valorFmt = formatBRL(valor);
    const competencia = `${mes || '-'}/${ano || '-'}`;

    const subject = `[Museus Centro] Nova NF recebida — ${team_member_name || 'Membro'} — ${competencia}`;

    const body = `Nova nota fiscal recebida no sistema Museus Centro.

Solicitante: ${team_member_name || '-'}
Cargo/Função: ${cargo || '-'}
Competência: ${competencia}
Valor: ${valorFmt}
ID do registro: ${payment_id || '-'}

ARQUIVOS:
• PDF (${nota_fiscal_file_name || 'nota_fiscal.pdf'}): ${nota_fiscal_url || '—'}
• XML (${xml_file_name || 'nota_fiscal.xml'}): ${xml_url || '—'}

ACESSE O SISTEMA:
${appUrl}

(Vá em Compras e Pagamentos → aba Equipe → Pagamentos da Equipe para aprovar ou devolver.)

Atenciosamente,
Museus Centro`;

    // Notificar emails fixos
    for (const email of NOTIFY_EMAILS) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject,
        body,
        from_name: 'Museus Centro',
      });
    }

    // Notificar o solicitante (confirmação)
    const emailSolicitante = requester_email || user_email;
    if (emailSolicitante && !NOTIFY_EMAILS.includes(emailSolicitante)) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: emailSolicitante,
        subject: `[Museus Centro] Seu envio foi recebido — ${competencia}`,
        body: `Olá, ${team_member_name || 'Membro'}!

Seu envio de nota fiscal foi recebido com sucesso e está aguardando aprovação da coordenação.

Competência: ${competencia}
Valor: ${valorFmt}
NF (PDF): ${nota_fiscal_file_name || '-'}
XML: ${xml_file_name || '-'}

Acompanhe o status em:
${appUrl}

Atenciosamente,
Museus Centro`,
        from_name: 'Museus Centro',
      });
    }

    return Response.json({ success: true, notified: NOTIFY_EMAILS.length + 1 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});