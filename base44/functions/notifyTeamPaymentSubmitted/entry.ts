import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function formatBRL(v: unknown) {
  const n = Number(v) || 0;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NOTIFY_EMAILS = [
  'notasfiscais@viadutodasartes.org.br',
  'adm@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
];

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

function buildInternalNotificationBody(payload: {
  team_member_name?: string;
  cargo?: string;
  competencia?: string;
  valorFmt?: string;
  payment_id?: string;
  nota_fiscal_file_name?: string;
  nota_fiscal_url?: string;
  xml_file_name?: string;
  xml_url?: string;
  appUrl?: string;
}) {
  return `Nova nota fiscal recebida no sistema Museus Centro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DADOS DO ENVIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solicitante: ${payload.team_member_name || '-'}
Cargo/Função: ${payload.cargo || '-'}
Competência: ${payload.competencia || '-'}
Valor: ${payload.valorFmt || '-'}
ID do registro: ${payload.payment_id || '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARQUIVOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PDF da nota fiscal
Nome do arquivo: ${payload.nota_fiscal_file_name || 'nota_fiscal.pdf'}
Link direto: ${payload.nota_fiscal_url || '—'}

XML da nota fiscal
Nome do arquivo: ${payload.xml_file_name || 'nota_fiscal.xml'}
Link direto: ${payload.xml_url || '—'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACESSO AO SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Link do sistema:
${payload.appUrl || '-'}

Caminho:
Compras e Pagamentos → aba Equipe → Pagamentos da Equipe

Ação esperada:
Aprovar ou devolver a nota fiscal.

Atenciosamente,
Museus Centro`;
}

function buildRequesterNotificationBody(payload: {
  team_member_name?: string;
  competencia?: string;
  valorFmt?: string;
  nota_fiscal_file_name?: string;
  nota_fiscal_url?: string;
  xml_file_name?: string;
  xml_url?: string;
  appUrl?: string;
}) {
  return `Olá, ${payload.team_member_name || 'Membro'}!

Seu envio de nota fiscal foi recebido com sucesso e está aguardando aprovação da coordenação.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESUMO DO ENVIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Competência: ${payload.competencia || '-'}
Valor: ${payload.valorFmt || '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARQUIVOS ENVIADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PDF da nota fiscal
Nome do arquivo: ${payload.nota_fiscal_file_name || 'nota_fiscal.pdf'}
Link direto: ${payload.nota_fiscal_url || '—'}

XML da nota fiscal
Nome do arquivo: ${payload.xml_file_name || 'nota_fiscal.xml'}
Link direto: ${payload.xml_url || '—'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACOMPANHAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você pode acompanhar o status no sistema:
${payload.appUrl || '-'}

Atenciosamente,
Museus Centro`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const {
      payment_id,
      team_member_name,
      cargo,
      mes,
      ano,
      valor,
      user_email,
      requester_email,
      nota_fiscal_url,
      xml_url,
      nota_fiscal_file_name,
      xml_file_name,
      app_link,
    } = payload || {};

    const appUrl = app_link || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';
    const valorFmt = formatBRL(valor);
    const competencia = `${mes || '-'}/${ano || '-'}`;

    const subject = `[Museus Centro] Nova NF recebida — ${team_member_name || 'Membro'} — ${competencia}`;

    const body = buildInternalNotificationBody({
      team_member_name,
      cargo,
      competencia,
      valorFmt,
      payment_id,
      nota_fiscal_file_name,
      nota_fiscal_url,
      xml_file_name,
      xml_url,
      appUrl,
    });

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

    if (emailSolicitante && !NOTIFY_EMAILS.includes(emailSolicitante)) {
      if (isInternalAppEmail(emailSolicitante)) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: emailSolicitante,
            subject: `[Museus Centro] Seu envio foi recebido — ${competencia}`,
            body: buildRequesterNotificationBody({
              team_member_name,
              competencia,
              valorFmt,
              nota_fiscal_file_name,
              nota_fiscal_url,
              xml_file_name,
              xml_url,
              appUrl,
            }),
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
