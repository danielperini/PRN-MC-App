import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function emailHtml({ nome }) {
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
    ul { padding-left: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Viaduto das Artes · Museus Centro</h1></div>
    <div class="body">
      <p>Olá, ${nome || ''}.</p>
      <p>A partir de agora, <strong>todas as oficinas</strong> devem ter lista de presença e lista de inscritos anexadas ao sistema.</p>
      <p>Esses documentos devem ser enviados diretamente pelo campo de <strong>Atividades</strong> do relatório mensal, ao registrar a atividade de oficina:</p>
      <ul>
        <li>Anexe a lista de presença no campo <strong>lista_presenca_url</strong>;</li>
        <li>Anexe a lista de inscritos no campo <strong>lista_inscritos_url</strong>.</li>
      </ul>
      <a class="cta-button" href="https://periniprojetos.com.br" target="_blank" rel="noopener">Acessar o sistema</a>
      <p class="footer">Comunicado institucional do sistema Museus Centro / Viaduto das Artes.</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini.mc@viadutodasartes.org.br'];
    const role = String(user?.role || '').toUpperCase();
    const baseRole = String(user?.base_role || '').toUpperCase();
    const isCoordOuAdmin =
      COORD_GERAL_EMAILS.includes(String(user?.email || '').toLowerCase()) ||
      user?.can_manage_users === true ||
      ['COORDENADOR', 'ADMIN', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA', 'COORD_COMUNICACAO', 'COORD_PROGRAMACAO'].includes(role) ||
      ['COORDENADOR', 'ADMIN'].includes(baseRole);

    if (!user || !isCoordOuAdmin) {
      return Response.json({ error: 'Acesso restrito a administradores ou coordenadores.' }, { status: 403 });
    }

    const membros = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '-created_date', 1000);

    const elegiveis = (membros || []).filter((m) => {
      const funcao = String(m.funcao || m.funcao_institucional || m.role || '').toLowerCase();
      return funcao.includes('educad') || funcao.includes('produt');
    });

    if (elegiveis.length === 0) {
      return Response.json({ success: true, message: 'Nenhum educador/produtor ativo encontrado.', enviados: 0 });
    }

    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);

    const enviadosHoje = await base44.asServiceRole.entities.NotificationLog.filter({
      notification_type: 'LISTA_PRESENCA_AVISO'
    }, '-created_date', 1000);

    const jaEnviadoHoje = new Set(
      (enviadosHoje || [])
        .filter((n) => new Date(n.created_date) >= hojeInicio)
        .flatMap((n) => n.recipients || [])
    );

    let enviados = 0;
    const resultados = [];

    for (const membro of elegiveis) {
      const email = membro.user_email;
      const nome = membro.user_name;
      if (!email) continue;

      if (jaEnviadoHoje.has(email)) {
        resultados.push({ email, status: 'skip_ja_enviado_hoje' });
        continue;
      }

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: 'Nova obrigatoriedade: lista de presença e inscritos em oficinas',
          body: emailHtml({ nome }),
          from_name: 'Museus Centro'
        });

        await base44.asServiceRole.entities.NotificationLog.create({
          notification_type: 'LISTA_PRESENCA_AVISO',
          channel: 'EMAIL',
          recipients: [email],
          subject: 'Nova obrigatoriedade: lista de presença e inscritos em oficinas',
          status: 'SENT',
          provider: 'base44_sendemail',
          sent_at: new Date().toISOString(),
          created_by: user.email,
          metadata_json: { team_member_id: membro.id }
        });

        enviados++;
        resultados.push({ email, status: 'enviado' });
      } catch (err) {
        resultados.push({ email, status: 'erro', error: err?.message || 'erro desconhecido' });
      }
    }

    return Response.json({ success: true, elegiveis: elegiveis.length, enviados, resultados });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});