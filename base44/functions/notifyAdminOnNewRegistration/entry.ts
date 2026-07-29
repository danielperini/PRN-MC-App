import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }

    // Aceita tanto chamada direta (registration passado no body) quanto automação de entidade (event.data)
    const registration = body.registration || body.event?.data || body;

    if (!registration?.email) {
      return Response.json({ success: true, skipped: 'no_registration_data' });
    }

    const ADMIN_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    const appUrl = 'https://app.base44.com';
    const approvalLink = `${appUrl}/UserManagement`;

    const roleLabel = {
      COORDENADOR: 'Coordenador',
      PROFISSIONAL: 'Profissional',
      OBSERVADOR: 'Observador',
      PATROCINADOR: 'Observador',
    }[registration.role || registration.base_role] || (registration.role || registration.base_role || 'Não informado');

    const emailBody = `Nova solicitação de acesso recebida na plataforma Museus Centro.

Nome: ${registration.full_name || 'Não informado'}
E-mail: ${registration.email}
Perfil solicitado: ${roleLabel}
Museu: ${registration.museu || 'Não informado'}
Função: ${registration.funcao || 'Não informado'}

Acesse a página de Gestão de Usuários para aprovar ou negar:
${approvalLink}

---
Museus Centro · Viaduto das Artes`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: ADMIN_EMAIL,
      subject: `Nova solicitação de acesso — ${registration.full_name || registration.email}`,
      body: emailBody,
      from_name: 'Museus Centro',
    });

    return Response.json({ success: true, notified: ADMIN_EMAIL });
  } catch (error) {
    console.error('Erro ao notificar admin:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});