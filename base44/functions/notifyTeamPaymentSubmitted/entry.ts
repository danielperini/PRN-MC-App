import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatBRL(v: unknown) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// BLOQUEIO: enviar apenas para o endereço autorizado
const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

const NOTIFY_EMAILS = [
  'notasfiscais@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
].filter(e => { if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; } return true; });

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isInternalAppEmail(email: string) {
  if (!email) return false;

  return (
    email.endsWith('@viadutodasartes.org.br') ||
    email.endsWith('@periniprojetos.com.br')
  );
}

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

    const sentFixed: string[] = [];
    const failedFixed: Array<{ email: string; error: string }> = [];

    for (const email of NOTIFY_EMAILS) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body,
          from_name: 'Museus Centro',
        });
        sentFixed.push(email);
      } catch (error: any) {
        failedFixed.push({
          email,
          error: error?.message || 'erro ao enviar'
        });
      }
    }

    const emailSolicitante = normalizeEmail(requester_email || user_email);
    let requesterNotification = 'skipped';
    let requesterReason = '';

    if (emailSolicitante && !NOTIFY_EMAILS.includes(emailSolicitante) && emailSolicitante === ALLOWED_EMAIL) {
      if (isInternalAppEmail(emailSolicitante)) {
        try {
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
          requesterNotification = 'sent';
        } catch (error: any) {
          requesterNotification = 'failed';
          requesterReason = error?.message || 'erro ao enviar';
        }
      } else {
        requesterNotification = 'skipped';
        requesterReason = 'Cannot send emails to users outside the app';
      }
    }

    return Response.json({
      success: true,
      fixed_recipients_sent: sentFixed,
      fixed_recipients_failed: failedFixed,
      requester_notification: requesterNotification,
      requester_reason: requesterReason,
      notified_count: sentFixed.length + (requesterNotification === 'sent' ? 1 : 0),
    });
  } catch (error: any) {
    return Response.json({
      error: error?.message || 'Erro interno ao enviar notificações'
    }, { status: 500 });
  }
});