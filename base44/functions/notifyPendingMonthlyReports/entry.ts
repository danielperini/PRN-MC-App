import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Nomes dos meses em pt-BR, capitalizados — igual ao formato salvo em Report.mes_referencia
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function emailHtml({ nome, mes, ano }) {
  return `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .header { background-color: #111827; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 18px; color: #fff; }
    .body { border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; padding: 24px; }
    .cta-button { display: inline-block; background-color: #111827; color: #fff !important; padding: 12px 22px; text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: bold; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Viaduto das Artes · Museus Centro</h1></div>
    <div class="body">
      <p>Olá, ${nome || ''}.</p>
      <p>O prazo de envio do relatório de <strong>${mes} de ${ano}</strong> já passou (dia 5) e ainda não identificamos o seu relatório enviado para aprovação.</p>
      <p>Por favor, acesse o sistema e envie seu relatório com urgência.</p>
      <a class="cta-button" href="https://periniprojetos.com.br" target="_blank" rel="noopener">Acessar o sistema</a>
      <p class="footer">Este é um lembrete automático do sistema Museus Centro / Viaduto das Artes.</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const mes = MESES_PT[now.getMonth()];
    const ano = now.getFullYear();

    const membros = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '-created_date', 1000);

    const elegiveis = (membros || []).filter((m) => {
      const funcao = String(m.funcao || m.funcao_institucional || m.role || '').toLowerCase();
      return funcao.includes('educad') || funcao.includes('produt');
    });

    if (elegiveis.length === 0) {
      return Response.json({ success: true, message: 'Nenhum educador/produtor ativo encontrado.', enviados: 0 });
    }

    const reportsDoMes = await base44.asServiceRole.entities.Report.filter({ mes_referencia: mes, ano });
    const statusOk = new Set(['SUBMITTED', 'IN_REVIEW', 'RETURNED', 'APPROVED']);

    const jaEnviou = (email, nome) => {
      return (reportsDoMes || []).some((r) => {
        if (!statusOk.has(String(r.status || '').toUpperCase())) return false;
        return (
          r.created_by === email ||
          r.author_email === email ||
          r.user_email === email ||
          (nome && r.author_name === nome)
        );
      });
    };

    let enviados = 0;
    const resultados = [];

    for (const membro of elegiveis) {
      const email = membro.user_email;
      const nome = membro.user_name;
      if (!email) continue;

      if (jaEnviou(email, nome)) {
        resultados.push({ email, status: 'skip_ja_enviado' });
        continue;
      }

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `Relatório de ${mes}/${ano} pendente — envie para aprovação`,
          body: emailHtml({ nome, mes, ano }),
          from_name: 'Museus Centro'
        });

        await base44.asServiceRole.entities.NotificationLog.create({
          notification_type: 'REPORT_DEADLINE_REMINDER',
          channel: 'EMAIL',
          recipients: [email],
          subject: `Relatório de ${mes}/${ano} pendente — envie para aprovação`,
          entity_type: 'Report',
          status: 'SENT',
          provider: 'base44_sendemail',
          sent_at: new Date().toISOString(),
          metadata_json: { mes, ano, team_member_id: membro.id }
        });

        enviados++;
        resultados.push({ email, status: 'enviado' });
      } catch (err) {
        resultados.push({ email, status: 'erro', error: err?.message || 'erro desconhecido' });
      }
    }

    return Response.json({ success: true, mes, ano, elegiveis: elegiveis.length, enviados, resultados });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});