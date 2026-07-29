import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
const ENTRADA_UNICA_URL = `${APP_URL}/EntradaUnica`;

const ELIGIBLE_ROLES = ['PROFISSIONAL', 'COORDENADOR', 'ADMIN'];
const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function buildEmailBody(nomeUsuario: string, mesAno: string): string {
  const primeiroNome = (nomeUsuario || 'Profissional').split(' ')[0];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Museus Centro · Viaduto das Artes</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">📋 Lembrete Mensal de Nota Fiscal</div>
      <div style="color:rgba(255,255,255,0.75);font-size:14px;margin-top:4px;">${mesAno}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px;">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px 0;">Olá, ${primeiroNome}!</p>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px 0;">
        Este é um lembrete institucional para que você envie sua(s) nota(s) fiscal(is) referente ao mês de <strong>${mesAno}</strong>
        por meio da plataforma <strong>Museus Centro</strong>. O envio correto e pontual é essencial para o controle financeiro
        e prestação de contas do projeto.
      </p>

      <!-- Destaque -->
      <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;padding:14px 16px;margin-bottom:24px;">
        <p style="font-size:14px;font-weight:600;color:#1e3a8a;margin:0;">
          ⚡ Envie agora pela Entrada de Documentos
        </p>
        <p style="font-size:13px;color:#3b82f6;margin:6px 0 0 0;">
          <a href="${ENTRADA_UNICA_URL}" style="color:#2563eb;font-weight:600;">${ENTRADA_UNICA_URL}</a>
        </p>
      </div>

      <!-- Passo a passo -->
      <p style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 14px 0;">Como enviar sua Nota Fiscal — passo a passo:</p>

      <table width="100%" cellpadding="0" cellspacing="0">
        ${[
          ['1', '📁 Reúna os dois arquivos da NF', 'Você precisará do arquivo <strong>PDF</strong> e do arquivo <strong>XML</strong> da nota fiscal.'],
          ['2', '🌐 Acesse a Entrada de Documentos', `Clique no link: <a href="${ENTRADA_UNICA_URL}" style="color:#2563eb;">Entrada de Documentos</a>`],
          ['3', '📤 Arraste ambos os arquivos ao mesmo tempo', 'Selecione o <strong>XML e o PDF simultaneamente</strong> e arraste para a área de upload. O sistema os reconhece automaticamente como um par.'],
          ['4', '🤖 Aguarde a análise automática pela IA', 'Os dados da nota fiscal (fornecedor, valor, data) serão preenchidos automaticamente.'],
          ['5', '🔍 Revise os dados identificados', 'Confira o fornecedor, o valor total, a rubrica sugerida e faça ajustes se necessário.'],
          ['6', '✅ Clique em "Enviar para Aprovação"', 'Após a revisão, clique no botão para submeter a NF à aprovação da coordenação.'],
          ['7', '📊 Acompanhe o status pelo painel de Compras', 'Você pode monitorar o andamento da sua solicitação no painel <strong>Compras</strong> do sistema.'],
        ].map(([num, titulo, desc]) => `
        <tr>
          <td style="vertical-align:top;width:36px;padding-bottom:14px;">
            <div style="width:28px;height:28px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;line-height:28px;">${num}</div>
          </td>
          <td style="vertical-align:top;padding-bottom:14px;padding-left:10px;">
            <div style="font-size:14px;font-weight:600;color:#1e293b;">${titulo}</div>
            <div style="font-size:13px;color:#64748b;margin-top:3px;line-height:1.5;">${desc}</div>
          </td>
        </tr>`).join('')}
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${ENTRADA_UNICA_URL}"
           style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Ir para a Entrada de Documentos →
        </a>
      </div>

      <p style="font-size:13px;color:#94a3b8;text-align:center;margin-top:20px;line-height:1.6;">
        Em caso de dúvidas, entre em contato com a equipe de administração do projeto.<br>
        Este e-mail foi gerado automaticamente pela plataforma Museus Centro.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Museus Centro · Viaduto das Artes · ${mesAno}
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const mesNome = MESES_PT[now.getMonth()];
    const ano = now.getFullYear();
    // O lembrete é para o mês anterior (dia 1 do mês atual = enviar NF do mês passado)
    const mesPrev = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const anoPrev = now.getMonth() === 0 ? ano - 1 : ano;
    const mesAno = `${MESES_PT[mesPrev]}/${anoPrev}`;

    // Buscar permissões com perfis elegíveis
    const allPermissions: any[] = await base44.asServiceRole.entities.UserPermission.list('-created_date', 500);

    const eligible = (allPermissions || []).filter((p: any) => {
      const role = (p.base_role || '').toUpperCase();
      const status = (p.status || '').toUpperCase();
      return ELIGIBLE_ROLES.includes(role) && status !== 'PENDENTE' && status !== 'REJEITADO';
    });

    if (eligible.length === 0) {
      return Response.json({ success: true, message: 'Nenhum usuário elegível encontrado.', sent: 0 });
    }

    // Buscar usuários para obter e-mails e nomes
    const allUsers: any[] = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const userMap: Record<string, any> = {};
    for (const u of allUsers || []) {
      if (u.email) userMap[u.email.toLowerCase()] = u;
    }

    const results: any[] = [];
    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Deduplicar por e-mail (um usuário pode ter múltiplas permissões)
    const seen = new Set<string>();
    const targets: any[] = [];
    for (const perm of eligible) {
      const email = (perm.user_email || '').toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const user = userMap[email];
      targets.push({ email, nome: user?.full_name || perm.user_nome || email });
    }

    for (const target of targets) {
      if (!target.email) { skippedCount++; continue; }

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: target.email,
          subject: `📋 Lembrete: Envie sua Nota Fiscal — ${mesAno}`,
          body: buildEmailBody(target.nome, mesAno),
          from_name: 'Museus Centro — Administrativo'
        });

        results.push({ email: target.email, status: 'sent' });
        sentCount++;
      } catch (e: any) {
        console.warn(`[notifyMonthlyInvoiceReminder] Falha ao enviar para ${target.email}:`, e?.message);
        results.push({ email: target.email, status: 'failed', error: e?.message });
        failCount++;
      }
    }

    // Registrar log de auditoria
    try {
      await base44.asServiceRole.entities.NotificationLog.create({
        notification_type: 'MONTHLY_INVOICE_REMINDER',
        channel: 'EMAIL',
        recipients: targets.map((t: any) => t.email),
        subject: `📋 Lembrete: Envie sua Nota Fiscal — ${mesAno}`,
        status: failCount === targets.length ? 'FAILED' : 'SENT',
        sent_at: now.toISOString(),
        metadata_json: { sent: sentCount, failed: failCount, skipped: skippedCount, mesAno, details: results }
      });
    } catch (logErr: any) {
      console.warn('[notifyMonthlyInvoiceReminder] Falha ao registrar log:', logErr?.message);
    }

    return Response.json({
      success: true,
      mesAno,
      sent: sentCount,
      failed: failCount,
      skipped: skippedCount,
      total: targets.length,
      details: results
    });

  } catch (error: any) {
    console.error('[notifyMonthlyInvoiceReminder] Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});