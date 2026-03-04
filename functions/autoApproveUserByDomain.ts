import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    if (!event || event.type !== 'create') {
      return Response.json({ success: true });
    }

    const registration = event.data;
    if (!registration || !registration.email || !registration.id) {
      return Response.json({ success: true });
    }

    // Domínios permitidos para aprovação automática
    const allowedDomains = ['@viadutodasartes.org.br', '@periniprojetos.com.br'];
    const userEmail = registration.email.toLowerCase();
    const isAllowedDomain = allowedDomains.some(domain => userEmail.endsWith(domain));

    if (!isAllowedDomain) {
      // Não aprovado automaticamente - seguirá para análise
      return Response.json({ 
        success: true, 
        message: 'Domínio não permitido para aprovação automática',
        autoApproved: false
      });
    }

    // Aprovar automaticamente
    const newUser = await base44.users.inviteUser(registration.email, 'user');

    // Criar permissões padrão
    await base44.asServiceRole.entities.UserPermission.create({
      user_email: registration.email,
      user_name: registration.full_name,
      base_role: 'PROFISSIONAL',
      can_view_all_reports: false,
      can_review_reports: false,
      can_manage_users: false,
      can_manage_files: false,
      can_manage_museus: false,
      can_manage_equipes: false,
      can_view_audit_log: false,
      can_manage_platform: false,
      must_submit_monthly_report: true,
    });

    // Atualizar status
    await base44.asServiceRole.entities.UserRegistration.update(registration.id, {
      status: 'APROVADO',
      reviewer_note: 'Aprovado automaticamente pelo domínio permitido',
    });

    // Enviar notificação
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: registration.email,
      subject: 'Bem-vindo à Plataforma de Relatórios! 🎉',
      body: `
<h2>Acesso Aprovado!</h2>
<p>Olá ${registration.full_name},</p>

<p>Sua solicitação de acesso à plataforma foi <strong>aprovada automaticamente</strong>!</p>

<div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
  <p><strong>Seus dados:</strong></p>
  <p>Email: ${registration.email}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu}</p>
</div>

<p>Você já pode acessar a plataforma agora. Bem-vindo!</p>

<p style="color: #666; font-size: 14px;">
  Se tiver dúvidas, entre em contato com um coordenador.
</p>
      `,
      from_name: 'Plataforma de Relatórios'
    });

    console.log(`[AUTO-APPROVE] Usuário ${registration.email} aprovado automaticamente`);

    return Response.json({ 
      success: true, 
      message: 'Usuário aprovado automaticamente',
      autoApproved: true,
      user: newUser
    });
  } catch (error) {
    console.error('Erro ao auto-aprovar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});