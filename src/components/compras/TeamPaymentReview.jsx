import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function isAllowedAutoApproveEmail(email: string) {
  const normalized = String(email || '').trim().toLowerCase();

  if (!normalized) return false;

  const allowedDomains = [
    '@viadutodasartes.org.br',
    '@periniprojetos.com.br',
    '@pbh.gov.br',
  ];

  return allowedDomains.some((domain) => normalized.endsWith(domain));
}

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

    const userEmail = String(registration.email || '').trim().toLowerCase();
    const isAllowedDomain = isAllowedAutoApproveEmail(userEmail);

    console.log('[AUTO-APPROVE] email:', registration.email);
    console.log('[AUTO-APPROVE] isAllowedDomain:', isAllowedDomain);

    if (!isAllowedDomain) {
      console.log('[PENDING-APPROVAL] entrou no fluxo de pendência');

      const allPermissions = await base44.asServiceRole.entities.UserPermission.list();
      console.log('[PENDING-APPROVAL] total UserPermission:', allPermissions.length);

      const approvers = allPermissions.filter((user) =>
        user.can_manage_users === true ||
        user.base_role === 'ADMIN' ||
        user.base_role === 'admin' ||
        user.base_role === 'COORDENADOR'
      );

      console.log('[PENDING-APPROVAL] total approvers:', approvers.length);

      for (const approver of approvers) {
        if (!approver.user_email) continue;

        console.log('[PENDING-APPROVAL] enviando email para:', approver.user_email);

        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: approver.user_email,
            subject: 'Novo usuário aguardando aprovação',
            body: `
<h2>Novo cadastro pendente de aprovação</h2>
<p>Um novo usuário realizou cadastro na plataforma e aguarda análise.</p>
<p><strong>Nome:</strong> ${registration.full_name || 'Não informado'}</p>
<p><strong>Email:</strong> ${registration.email}</p>
<p><strong>Função:</strong> ${registration.funcao || 'Não informado'}</p>
<p><strong>Museu:</strong> ${registration.museu || 'Não informado'}</p>
<p>Acesse a aba de usuários da plataforma para aprovar ou rejeitar este cadastro.</p>
            `,
            from_name: 'Plataforma de Relatórios',
          });

          console.log('[PENDING-APPROVAL] email enviado para:', approver.user_email);
        } catch (sendError) {
          console.error(
            '[PENDING-APPROVAL] erro ao enviar para:',
            approver.user_email,
            sendError
          );
        }
      }

      console.log('[PENDING-APPROVAL] fluxo concluído para:', registration.email);

      return Response.json({
        success: true,
        message: 'Domínio não permitido para aprovação automática; coordenadores notificados',
        autoApproved: false,
      });
    }

    const existingPermissions = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: registration.email,
    });

    if (existingPermissions && existingPermissions.length > 0) {
      await base44.asServiceRole.entities.UserRegistration.update(registration.id, {
        status: 'APROVADO',
        reviewer_note: 'Aprovado automaticamente pelo domínio permitido; permissões já existiam',
      });

      return Response.json({
        success: true,
        message: 'Usuário já possuía permissões e foi marcado como aprovado',
        autoApproved: true,
        existingPermissions: existingPermissions[0],
      });
    }

    const newUser = await base44.users.inviteUser(registration.email, 'user');

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

    await base44.asServiceRole.entities.UserRegistration.update(registration.id, {
      status: 'APROVADO',
      reviewer_note: 'Aprovado automaticamente pelo domínio permitido',
    });

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: registration.email,
      subject: 'Bem-vindo à Plataforma de Relatórios! 🎉',
      body: `
<h2>Acesso Aprovado!</h2>
<p>Olá ${registration.full_name || 'usuário'},</p>

<p>Sua solicitação de acesso à plataforma foi <strong>aprovada automaticamente</strong>!</p>

<div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
  <p><strong>Seus dados:</strong></p>
  <p>Email: ${registration.email}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu || 'Não informado'}</p>
</div>

<p>Você já pode acessar a plataforma agora. Bem-vindo!</p>

<p style="color: #666; font-size: 14px;">
  Se tiver dúvidas, entre em contato com um coordenador.
</p>
      `,
      from_name: 'Plataforma de Relatórios',
    });

    console.log('[AUTO-APPROVE] usuário aprovado automaticamente:', registration.email);

    return Response.json({
      success: true,
      message: 'Usuário aprovado automaticamente',
      autoApproved: true,
      user: newUser,
    });
  } catch (error) {
    console.error('Erro ao auto-aprovar usuário:', error);
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});
