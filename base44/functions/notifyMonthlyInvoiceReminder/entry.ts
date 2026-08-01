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
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">📋 Lembrete: Emita e envie sua Nota Fiscal</div>
      <div style="color:rgba(255,255,255,0.75);font-size:14px;margin-top:4px;">${mesAno}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px;">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px 0;">Olá, ${primeiroNome}!</p>
      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px 0;">
        Este é o lembrete mensal para que você emita e envie sua nota fiscal referente ao mês de
        <strong>${mesAno}</strong> pelo aplicativo <strong>Museus Centro</strong>.
      </p>

      <!-- Destaque prazo -->
      <div style="background:#fffbeb;border-left:4px solid #d97706;border-radius:6px;padding:14px 16px;margin-bottom:24px;">
        <p style="font-size:14px;font-weight:700;color:#92400e;margin:0;">
          ⏰ Prazo recomendado: até o dia 4 deste mês
        </p>
        <p style="font-size:13px;color:#b45309;margin:6px 0 0 0;">
          Emita sua NF no portal da prefeitura a partir do dia 1º e envie pelo app preferencialmente até o dia 4.
        </p>
      </div>

      <!-- Passo a passo -->
      <p style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 14px 0;">Como enviar sua Nota Fiscal — passo a passo:</p>

      <table width="100%" cellpadding="0" cellspacing="0">
        ${[
          ['1', 'Emita sua NF no portal da prefeitura', 'Acesse o sistema NFS-e ou sistema municipal da sua cidade e emita a nota fiscal referente ao mês trabalhado.'],
          ['2', 'Baixe o PDF e o XML', 'Faça download do arquivo <strong>PDF</strong> e do arquivo <strong>XML</strong> da nota emitida.'],
          ['3', 'Acesse a Entrada de Documentos no app', `Clique no link abaixo ou acesse o menu lateral do sistema: <a href="${ENTRADA_UNICA_URL}" style="color:#2563eb;">Entrada de Documentos</a>`],
          ['4', 'Faça o upload do PDF e do XML', 'Arraste ou selecione ambos os arquivos na área de upload. O sistema reconhece o par automaticamente.'],
          ['5', 'Revise os dados e envie para aprovação', 'Confirme as informações preenchidas automaticamente e clique em <strong>"Enviar para Aprovação"</strong>.'],
        ].map(([num, titulo, desc]) => `
        <tr>
          <td style="vertical-align:top;width:36px;padding-bottom:16px;">
            <div style="width:28px;height:28px;background:#1e293b;color:#fff;font-size:13px;font-weight:700;border-radius:50%;text-align:center;line-height:28px;">${num}</div>
          </td>
          <td style="vertical-align:top;padding-bottom:16px;padding-left:10px;">
            <div style="font-size:14px;font-weight:600;color:#1e293b;">${titulo}</div>
            <div style="font-size:13px;color:#64748b;margin-top:3px;line-height:1.5;">${desc}</div>
          </td>
        </tr>`).join('')}
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${ENTRADA_UNICA_URL}"
           style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Acessar Entrada de Documentos →
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
    const now = new Date();

    // ── JANELA DE ENVIO ───────────────────────────────────────────────────────
    // Só envia entre os dias 1 e 4 do mês (UTC). Fora desse intervalo, retorna silenciosamente.
    if (now.getUTCDate() > 4) {
      return Response.json({
        success: true,
        skipped: true,
        reason: 'Fora da janela de envio (dias 1–4)',
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const base44 = createClientFromRequest(req);
    const mesAtualIdx = now.getMonth();
    const ano = now.getFullYear();
    // O lembrete é para o mês anterior (dia 1 do mês atual = emitir NF do mês passado)
    const mesPrevIdx = mesAtualIdx === 0 ? 11 : mesAtualIdx - 1;
    const anoPrev = mesAtualIdx === 0 ? ano - 1 : ano;
    const mesAno = `${MESES_PT[mesPrevIdx]}/${anoPrev}`;

    // ── IDEMPOTÊNCIA ──────────────────────────────────────────────────────────
    // Verifica se já existe log de MONTHLY_NF_REMINDER para este mês/ano atual
    const primeiroDiaMes = new Date(ano, mesAtualIdx, 1).toISOString();
    const ultimoDiaMes = new Date(ano, mesAtualIdx + 1, 0, 23, 59, 59).toISOString();

    let existingLogs: any[] = [];
    try {
      existingLogs = await base44.asServiceRole.entities.NotificationLog.filter({
        notification_type: 'MONTHLY_NF_REMINDER',
        sent_at: { $gte: primeiroDiaMes, $lte: ultimoDiaMes },
      }, '-created_date', 5);
    } catch (_) { /* ignora erro de filtro; prossegue com envio */ }

    if (existingLogs && existingLogs.length > 0) {
      return Response.json({
        success: true,
        message: `Lembrete já enviado neste mês (${mesAno}). Ignorando reenvio.`,
        idempotent: true,
        sent: 0,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    let sentCount = 0;
    let failCount = 0;
    const results: any[] = [];

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
      if (!target.email) continue;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: target.email,
          subject: `📋 Lembrete: emita sua nota fiscal até o dia 4`,
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

    // Registrar log de auditoria com tipo canônico MONTHLY_NF_REMINDER
    try {
      await base44.asServiceRole.entities.NotificationLog.create({
        notification_type: 'MONTHLY_NF_REMINDER',
        channel: 'EMAIL',
        recipients: targets.map((t: any) => t.email),
        subject: `📋 Lembrete: emita sua nota fiscal até o dia 4`,
        status: failCount === targets.length && targets.length > 0 ? 'FAILED' : 'SENT',
        sent_at: now.toISOString(),
        metadata_json: { sent: sentCount, failed: failCount, mesAno, details: results }
      });
    } catch (logErr: any) {
      console.warn('[notifyMonthlyInvoiceReminder] Falha ao registrar log:', logErr?.message);
    }

    return Response.json({
      success: true,
      mesAno,
      sent: sentCount,
      failed: failCount,
      total: targets.length,
      details: results
    });

  } catch (error: any) {
    console.error('[notifyMonthlyInvoiceReminder] Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});