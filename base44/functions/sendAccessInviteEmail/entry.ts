import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

const INVITE_TEMPLATE_PATROCINADOR = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">Sistema Museus Centro / Viaduto das Artes</h2>

  <p>O sistema <strong>Museus Centro / Viaduto das Artes</strong> já está disponível para acompanhamento das atividades, programação, indicadores, galerias, relatórios e execução orçamentária consolidada do projeto.</p>

  <p>O acesso pode ser realizado preferencialmente utilizando sua <strong>conta Google institucional</strong>.</p>

  <p>Usuários com domínio <strong>@pbh.gov.br</strong> possuem aprovação automática no sistema.</p>

  <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Link de acesso:</strong><br>
    <a href="${APP_URL}" style="color: #2563eb;">${APP_URL}</a></p>
  </div>

  <p style="color: #64748b; font-size: 13px;">Atenciosamente,<br><strong>Equipe Museus Centro</strong></p>
</div>
`;

const ANDRE_EMAIL_BODY = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">Sistema Museus Centro / Viaduto das Artes</h2>

  <p>Olá, André.</p>

  <p>Seu acesso ao sistema <strong>Museus Centro / Viaduto das Artes</strong> já está liberado.</p>

  <p>Recomendamos utilizar a entrada com <strong>Google</strong> para acesso mais rápido e seguro.</p>

  <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Link de acesso:</strong><br>
    <a href="${APP_URL}" style="color: #2563eb;">${APP_URL}</a></p>
  </div>

  <p>Ao entrar, seu perfil já estará previamente aprovado.</p>

  <p style="color: #64748b; font-size: 13px;">Atenciosamente,<br><strong>Equipe Museus Centro</strong></p>
</div>
`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: apenas coordenadores' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { type, to, nome } = body;

    // Tipo "andre" → email personalizado para retinaeletricafilmes@gmail.com
    if (type === 'andre') {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'retinaeletricafilmes@gmail.com',
        subject: 'Acesso ao Sistema Museus Centro',
        body: ANDRE_EMAIL_BODY,
        from_name: 'Museus Centro'
      });
      return Response.json({ success: true, sent_to: 'retinaeletricafilmes@gmail.com' });
    }

    // Tipo "patrocinador" ou "pbh" → template institucional para destinatário informado
    if ((type === 'patrocinador' || type === 'pbh') && to) {
      const subject = type === 'pbh'
        ? 'Acesso ao Sistema Museus Centro — Equipe PBH'
        : 'Acesso ao Sistema Museus Centro — Patrocinadores';

      const bodyHtml = INVITE_TEMPLATE_PATROCINADOR.replace(
        '<p>O sistema',
        `<p>Olá${nome ? `, ${nome}` : ''}.</p><p>O sistema`
      );

      await base44.asServiceRole.integrations.Core.SendEmail({
        to,
        subject,
        body: bodyHtml,
        from_name: 'Museus Centro'
      });
      return Response.json({ success: true, sent_to: to });
    }

    return Response.json({ error: 'Parâmetros inválidos. Use type=andre|patrocinador|pbh e to=email' }, { status: 400 });

  } catch (error) {
    console.error('sendAccessInviteEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});