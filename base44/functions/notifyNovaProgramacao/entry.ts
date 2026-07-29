import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
const AGENDA_URL = `${APP_URL}/Agenda`;
const GALERIA_URL = `${APP_URL}/GaleriaFotos`;

// Logo do Museus Centro (SVG inline — ícone cubo/diamante usado no app)
const LOGO_SVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#111111"/>
  <polygon points="32,10 54,22 54,42 32,54 10,42 10,22" fill="none" stroke="white" stroke-width="2.5"/>
  <polygon points="32,10 54,22 32,34 10,22" fill="white" fill-opacity="0.15" stroke="white" stroke-width="1.5"/>
  <polygon points="32,34 54,22 54,42 32,54" fill="white" fill-opacity="0.08" stroke="white" stroke-width="1.5"/>
  <polygon points="32,34 10,22 10,42 32,54" fill="white" fill-opacity="0.05" stroke="white" stroke-width="1.5"/>
</svg>`;

function buildEmailHtml(prog) {
  const museu = prog.museu || prog.equipamento || 'Museus Centro';
  const titulo = prog.titulo || prog.nome_acao || 'Nova Programação';
  const descricao = prog.descricao || prog.sinopse || '';
  const data = prog.data || prog.data_inicio || '';
  const horario = prog.horario || '';
  const local = prog.local || prog.endereco || '';
  const publico = prog.publico_alvo || '';
  const vagas = prog.vagas || '';
  const inscricao = prog.inscricao || '';
  const linkInscricao = prog.link_inscricao || '';
  const minibios = prog.minibios || '';
  const observacoes = prog.observacoes || '';

  const dataHorario = [data, horario].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Nova Programação — ${museu}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- HEADER com logo centralizado -->
          <tr>
            <td style="background:#111111;padding:32px;text-align:center;">
              ${LOGO_SVG}
              <p style="margin:14px 0 0;color:#ffffff;font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;">Museus Centro</p>
            </td>
          </tr>

          <!-- BADGE museu -->
          <tr>
            <td style="padding:28px 32px 0;text-align:center;">
              <span style="display:inline-block;background:#111111;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 14px;border-radius:20px;">${museu}</span>
            </td>
          </tr>

          <!-- TÍTULO -->
          <tr>
            <td style="padding:16px 32px 0;text-align:center;">
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#111111;line-height:1.25;">${titulo}</h1>
            </td>
          </tr>

          <!-- SUBTÍTULO -->
          <tr>
            <td style="padding:8px 32px 0;text-align:center;">
              <p style="margin:0;font-size:14px;color:#666666;">Nova atividade cadastrada na agenda</p>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr><td style="padding:24px 32px 0;"><hr style="border:none;border-top:1px solid #eeeeee;margin:0;"/></td></tr>

          <!-- INFOS data/local -->
          ${(dataHorario || local) ? `
          <tr>
            <td style="padding:20px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${dataHorario ? `<td style="width:50%;padding-right:8px;">
                    <p style="margin:0 0 2px;font-size:10px;color:#999999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Data e Horário</p>
                    <p style="margin:0;font-size:14px;color:#222222;font-weight:600;">${dataHorario}</p>
                  </td>` : ''}
                  ${local ? `<td style="width:50%;padding-left:8px;">
                    <p style="margin:0 0 2px;font-size:10px;color:#999999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Local</p>
                    <p style="margin:0;font-size:14px;color:#222222;font-weight:600;">${local}</p>
                  </td>` : ''}
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- DESCRIÇÃO -->
          ${descricao ? `
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0 0 8px;font-size:10px;color:#999999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Sobre a Programação</p>
              <div style="font-size:15px;color:#333333;line-height:1.7;white-space:pre-wrap;">${descricao}</div>
            </td>
          </tr>` : ''}

          <!-- MINIBIOS -->
          ${minibios ? `
          <tr>
            <td style="padding:20px 32px 0;">
              <p style="margin:0 0 8px;font-size:10px;color:#999999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Sobre os Artistas</p>
              <div style="font-size:14px;color:#444444;line-height:1.65;white-space:pre-wrap;">${minibios}</div>
            </td>
          </tr>` : ''}

          <!-- DETALHES extras -->
          ${(publico || vagas || inscricao) ? `
          <tr>
            <td style="padding:20px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:10px;padding:16px;" >
                <tr><td style="padding:0 0 0 0;">
                  ${publico ? `<p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong>Público-alvo:</strong> ${publico}</p>` : ''}
                  ${vagas ? `<p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong>Vagas:</strong> ${vagas}</p>` : ''}
                  ${inscricao ? `<p style="margin:0;font-size:13px;color:#555555;"><strong>Inscrições:</strong> ${inscricao}</p>` : ''}
                </td></tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- OBSERVAÇÕES -->
          ${observacoes ? `
          <tr>
            <td style="padding:16px 32px 0;">
              <p style="margin:0;font-size:13px;color:#888888;font-style:italic;line-height:1.6;">${observacoes}</p>
            </td>
          </tr>` : ''}

          <!-- DIVIDER -->
          <tr><td style="padding:28px 32px 0;"><hr style="border:none;border-top:1px solid #eeeeee;margin:0;"/></td></tr>

          <!-- CTA AGENDA -->
          <tr>
            <td style="padding:28px 32px 16px;text-align:center;">
              <p style="margin:0 0 16px;font-size:15px;color:#444444;">Confira todos os eventos e atividades na nossa agenda completa.</p>
              <a href="${AGENDA_URL}" style="display:inline-block;background:#111111;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.5px;">Ver a Agenda Completa →</a>
              ${linkInscricao ? `<br/><br/><a href="${linkInscricao}" style="display:inline-block;background:#ffffff;color:#111111;font-size:13px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:8px;border:1.5px solid #cccccc;">Fazer Inscrição</a>` : ''}
            </td>
          </tr>

          <!-- CTA GALERIA -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <p style="margin:0 0 12px;font-size:14px;color:#666666;">Explore também a nossa galeria de fotos e registros das atividades dos museus.</p>
              <a href="${GALERIA_URL}" style="display:inline-block;background:#ffffff;color:#111111;font-size:13px;font-weight:600;text-decoration:none;padding:10px 24px;border-radius:8px;border:1.5px solid #cccccc;">🖼 Ver Galeria de Fotos</a>
            </td>
          </tr>

          <!-- AVISO INTERNO -->
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="border-left:3px solid #d97706;background:#fffbeb;border-radius:6px;padding:12px 16px;">
                <p style="margin:0;font-size:12px;color:#666666;line-height:1.6;">Este e-mail é uma atualização interna do sistema Museus Centro, enviada exclusivamente para membros e observadores cadastrados na plataforma. Não se trata de material de divulgação pública — por favor, não encaminhe ou compartilhe este conteúdo.</p>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8f8f8;border-top:1px solid #eeeeee;padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#aaaaaa;">Museus Centro · Viaduto das Artes</p>
              <p style="margin:4px 0 0;font-size:11px;color:#cccccc;">Você está recebendo este e-mail porque é membro ou observador do sistema.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Aceita chamada de automação (sem auth de usuário) via service role
    const payload = await req.json().catch(() => ({}));

    // Automação de entidade entrega { event, data, old_data, ... }; chamada direta entrega a programação flat
    const prog = (payload.data && (payload.data.titulo || payload.data.nome_acao))
      ? payload.data
      : (payload.programacao || payload);
    if (!prog || (!prog.titulo && !prog.nome_acao)) {
      return Response.json({ error: 'Dados da programação não fornecidos' }, { status: 400 });
    }

    const museu = prog.museu || prog.equipamento || 'Museus Centro';
    const titulo = prog.titulo || prog.nome_acao || 'Nova Programação';

    // Buscar TODOS os usuários registrados (inclusive observadores)
    const users = await base44.asServiceRole.entities.User.list().catch(() => []);

    if (!users || users.length === 0) {
      return Response.json({ message: 'Nenhum usuário para notificar', sent: 0 });
    }

    const htmlBody = buildEmailHtml(prog);
    const subject = `🎭 Nova programação em ${museu}: ${titulo}`;

    let sent = 0;
    let errors = 0;

    for (const user of users) {
      if (!user.email) continue;
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          subject,
          body: htmlBody,
          from_name: 'Museus Centro',
        });
        sent++;
      } catch (err) {
        console.warn(`Falha ao enviar para ${user.email}:`, err.message);
        errors++;
      }
    }

    return Response.json({
      message: `Notificações enviadas: ${sent} sucesso, ${errors} falhas`,
      sent,
      errors,
      titulo,
      museu,
    });

  } catch (error) {
    console.error('Erro em notifyNovaProgramacao:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});