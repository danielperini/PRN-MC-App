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

    const appUrl =
      app_link ||
      'https://relatorios-perini-pro-mc-viadutodasartes.base44.app/Compras';

    const valorFmt = formatBRL(valor);
    const competencia = `${mes || '-'}/${ano || '-'}`;

    const subject = `[Museus Centro] Nova NF recebida — ${team_member_name || 'Membro'} — ${competencia}`;

    // ✅ EMAIL FORMATADO (MAIS CLARO E PROFISSIONAL)
    const body = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 NOVA NOTA FISCAL RECEBIDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 SOLICITANTE
Nome: ${team_member_name || '-'}
Cargo/Função: ${cargo || '-'}

📅 COMPETÊNCIA
${competencia}

💰 VALOR
${valorFmt}

🆔 IDENTIFICAÇÃO
ID do registro: ${payment_id || '-'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📎 ARQUIVOS ANEXADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 PDF da Nota Fiscal:
${nota_fiscal_file_name || 'nota_fiscal.pdf'}
👉 ${nota_fiscal_url || 'Arquivo não disponível'}

📄 XML da Nota Fiscal:
${xml_file_name || 'nota_fiscal.xml'}
👉 ${xml_url || 'Arquivo não disponível'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔎 AÇÃO NECESSÁRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Acesse o sistema para análise e aprovação:

👉 ${appUrl}

Caminho:
Compras e Pagamentos → Aba "Equipe" → Pagamentos da Equipe

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ OBSERVAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Arquivos já foram renomeados automaticamente
• Envio registrado no sistema
• Aguardando aprovação da coordenação

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Museus Centro
`;

    // 🔔 ENVIAR PARA LISTA FIXA
    for (const email of NOTIFY_EMAILS) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject,
        body,
        from_name: 'Museus Centro',
      });
    }

    // 📩 CONFIRMAÇÃO PARA USUÁRIO
    const emailSolicitante = requester_email || user_email;

    if (emailSolicitante && !NOTIFY_EMAILS.includes(emailSolicitante)) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: emailSolicitante,
        subject: `[Museus Centro] Envio recebido — ${competencia}`,
        body: `
Olá, ${team_member_name || 'Membro'}!

Seu envio de nota fiscal foi registrado com sucesso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Competência: ${competencia}
💰 Valor: ${valorFmt}
📄 PDF: ${nota_fiscal_file_name || '-'}
📄 XML: ${xml_file_name || '-'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Acompanhe o status em:
👉 ${appUrl}

Seu envio está aguardando aprovação da coordenação.

Atenciosamente,  
Museus Centro
`,
        from_name: 'Museus Centro',
      });
    }

    return Response.json({
      success: true,
      notified: NOTIFY_EMAILS.length + 1,
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});
