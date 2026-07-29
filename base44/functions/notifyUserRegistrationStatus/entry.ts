import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ROLE_LABELS: Record<string, string> = {
  COORDENADOR: 'Coordenador',
  PROFISSIONAL: 'Profissional',
  OBSERVADOR: 'Observador (acesso de leitura)',
  PATROCINADOR: 'Observador (acesso de leitura)',
  admin: 'Administrador',
  ADMIN: 'Administrador',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Suporta chamada direta do frontend ({ registration: {...} })
    // ou via automação de entidade ({ event: { type, data } })
    let registration: Record<string, any> | null = null;

    if (body.registration) {
      registration = body.registration;
    } else if (body.event?.data) {
      const { event } = body;
      if (event.type !== 'update') return Response.json({ success: true });
      registration = event.data;
    }

    if (!registration || !registration.status || !['APROVADO', 'REJEITADO'].includes(registration.status)) {
      return Response.json({ success: true });
    }

    if (!registration.email) {
      return Response.json({ success: true, skipped: true, reason: 'no_email' });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://museuscentro.base44.app';
    const isApproved = registration.status === 'APROVADO';
    const nome = registration.full_name || 'Usuário';
    const museu = registration.museu || '';
    const roleCode = registration.base_role || registration.role || 'PROFISSIONAL';
    const perfilLabel = ROLE_LABELS[roleCode] || roleCode;

    let subject: string;
    let emailBody: string;

    if (isApproved) {
      subject = `✅ Acesso liberado — Museus Centro`;
      emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        
        <!-- Cabeçalho -->
        <tr>
          <td style="background:#000000;padding:28px 36px;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Museus Centro</p>
            <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">Viaduto das Artes</p>
          </td>
        </tr>

        <!-- Banner verde -->
        <tr>
          <td style="background:#dcfce7;border-bottom:1px solid #bbf7d0;padding:20px 36px;">
            <p style="margin:0;color:#166534;font-size:15px;font-weight:600;">✅ Seu acesso foi liberado!</p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;color:#111827;font-size:15px;">Olá, <strong>${nome}</strong>!</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Sua solicitação de acesso à plataforma Museus Centro foi <strong>aprovada</strong> pela coordenação. A partir de agora você já pode entrar no sistema.
            </p>

            <!-- Bloco de perfil -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Seu perfil de acesso</p>
              <p style="margin:0;color:#166534;font-size:22px;font-weight:700;">${perfilLabel}</p>
              ${museu ? `<p style="margin:6px 0 0;color:#374151;font-size:13px;">Museu: <strong>${museu}</strong></p>` : ''}
            </div>

            <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Para acessar, use o mesmo método de login que você utilizou ao se cadastrar:</p>
            <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
              <li>Login com Google</li>
              <li>Login com Microsoft</li>
              <li>E-mail e senha</li>
            </ul>

            <a href="${appUrl}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:-0.2px;">
              Acessar a plataforma →
            </a>
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Em caso de dúvidas, entre em contato com a coordenação do projeto.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    } else {
      subject = `Sua solicitação de acesso — Museus Centro`;
      emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        
        <!-- Cabeçalho -->
        <tr>
          <td style="background:#000000;padding:28px 36px;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Museus Centro</p>
            <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">Viaduto das Artes</p>
          </td>
        </tr>

        <!-- Banner vermelho -->
        <tr>
          <td style="background:#fef2f2;border-bottom:1px solid #fecaca;padding:20px 36px;">
            <p style="margin:0;color:#991b1b;font-size:15px;font-weight:600;">Solicitação não aprovada neste momento</p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;color:#111827;font-size:15px;">Olá, <strong>${nome}</strong>!</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Agradecemos o seu interesse em acessar a plataforma Museus Centro. Infelizmente, sua solicitação não foi aprovada neste momento pela coordenação.
            </p>
            ${registration.reviewer_note ? `
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Observação</p>
              <p style="margin:0;color:#374151;font-size:14px;">${registration.reviewer_note}</p>
            </div>` : ''}
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
              Se você acredita que houve um equívoco ou deseja mais informações, entre em contato diretamente com a coordenação do projeto.
            </p>
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Museus Centro — Viaduto das Artes</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    }

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: registration.email,
      subject,
      body: emailBody,
      from_name: 'Museus Centro — Viaduto das Artes',
    });

    return Response.json({ success: true, sent_to: registration.email });
  } catch (error) {
    console.error('Erro ao notificar usuário:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});