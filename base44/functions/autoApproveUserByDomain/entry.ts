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
    const allowedDomains = ['@viadutodasartes.org.br', '@periniprojetos.com.br', '@pbh.gov.br'];
    const userEmail = registration.email.toLowerCase();
    const isAllowedDomain = allowedDomains.some(domain => userEmail.endsWith(domain));

    console.log('[AUTO-APPROVE] email:', registration.email);
    console.log('[AUTO-APPROVE] isAllowedDomain:', isAllowedDomain);

    if (!isAllowedDomain) {
      console.log('[PENDING-APPROVAL] entrou no fluxo de pendência');

      // Buscar usuários que podem gerenciar novos cadastros
      const allPermissions = await base44.asServiceRole.entities.UserPermission.list();
      console.log('[PENDING-APPROVAL] total UserPermission:', allPermissions.length);

      const approvers = allPermissions.filter(user =>
        user.can_manage_users === true ||
        user.base_role === 'ADMIN' ||
        user.base_role === 'admin' ||
        user.base_role === 'COORDENADOR'
      );

      console.log('[PENDING-APPROVAL] total approvers:', approvers.length);

      // Enviar e-mail para os aprovadores
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
            from_name: 'Plataforma de Relatórios'
          });

          console.log('[PENDING-APPROVAL] email enviado para:', approver.user_email);
        } catch (sendError) {
          console.error('[PENDING-APPROVAL] erro ao enviar para:', approver.user_email, sendError);
        }
      }

      console.log('[PENDING-APPROVAL] fluxo concluído para:', registration.email);

      return Response.json({
        success: true,
        message: 'Domínio não permitido para aprovação automática; coordenadores notificados',
        autoApproved: false
      });
    }

    // Definir perfil de acordo com o domínio
    const isPbh = userEmail.endsWith('@pbh.gov.br');

    // Aprovar automaticamente
    const newUser = await base44.users.inviteUser(registration.email, 'user');

    // Criar permissões padrão — observador para @pbh.gov.br, profissional para os demais
    if (isPbh) {
      await base44.asServiceRole.entities.UserPermission.create({
        user_email: registration.email,
        user_name: registration.full_name,
        base_role: 'PATROCINADOR',
        can_view_all_reports: false,
        can_review_reports: false,
        can_manage_users: false,
        can_manage_files: false,
        can_manage_museus: false,
        can_manage_equipes: false,
        can_view_audit_log: false,
        can_manage_platform: false,
        must_submit_monthly_report: false,
        pode_ver_saude_orcamentaria: false,
        pode_gerenciar_rubricas: false,
        pode_aprovar_solicitacoes: false,
        can_view_sponsor_dashboard: true,
        can_view_approved_reports: true,
        can_view_approved_programacao: true,
        can_view_public_gallery: true,
        can_view_budget_summary: true,
        can_view_project_kpis: true,
      });
    } else {
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
    }

    // Atualizar status
    await base44.asServiceRole.entities.UserRegistration.update(registration.id, {
      status: 'APROVADO',
      reviewer_note: isPbh
        ? 'Aprovado automaticamente como Observador (domínio @pbh.gov.br)'
        : 'Aprovado automaticamente pelo domínio permitido',
    });

    // Enviar notificação ao usuário aprovado
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
  <p>Perfil: ${isPbh ? 'Observador' : 'Profissional'}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu || 'Não informado'}</p>
</div>

<p>Você já pode acessar a plataforma agora. Bem-vindo!</p>

<p style="color: #666; font-size: 14px;">
  Se tiver dúvidas, entre em contato com um coordenador.
</p>
      `,
      from_name: 'Plataforma de Relatórios'
    });

    console.log('[AUTO-APPROVE] usuário aprovado automaticamente:', registration.email);

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