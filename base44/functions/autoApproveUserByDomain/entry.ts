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

    // Domínios e emails permitidos para aprovação automática
    const allowedDomains = ['@viadutodasartes.org.br', '@periniprojetos.com.br', '@pbh.gov.br'];
    const allowedEmails = ['retinaeletricafilmes@gmail.com'];
    const userEmail = registration.email.toLowerCase();
    const isAllowedDomain = allowedDomains.some(domain => userEmail.endsWith(domain));
    const isAllowedEmail = allowedEmails.includes(userEmail);

    console.log('[AUTO-APPROVE] email:', registration.email);
    console.log('[AUTO-APPROVE] isAllowedDomain:', isAllowedDomain);

    if (!isAllowedDomain && !isAllowedEmail) {
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

    // Definir perfil de acordo com o domínio/email
    const isPbh = userEmail.endsWith('@pbh.gov.br');
    const isObservador = isPbh || isAllowedEmail;

    // Aprovar automaticamente
    const newUser = await base44.users.inviteUser(registration.email, 'user');

    // Criar permissões — OBSERVADOR_PATROCINADOR para @pbh.gov.br e emails específicos, PROFISSIONAL para demais
    if (isObservador) {
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
        must_submit_monthly_reports: false,
        gestao_compras: false,
        pode_ver_saude_orcamentaria: false,
        pode_gerenciar_rubricas: false,
        pode_aprovar_solicitacoes: false,
        can_curate_news: false,
        can_manage_momentos: false,
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
        must_submit_monthly_reports: true,
      });
    }

    const perfilLabel = isAllowedEmail ? 'Observador Patrocinador' : isPbh ? 'Observador (PBH)' : 'Profissional';

    // Atualizar status
    await base44.asServiceRole.entities.UserRegistration.update(registration.id, {
      status: 'APROVADO',
      reviewer_note: isObservador
        ? `Aprovado automaticamente como ${perfilLabel}`
        : 'Aprovado automaticamente pelo domínio permitido',
    });

    const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

    // Email personalizado para retinaeletricafilmes@gmail.com (André)
    if (isAllowedEmail) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: registration.email,
        subject: 'Acesso ao Sistema Museus Centro',
        body: `
<p>Olá, André.</p>
<p>Seu acesso ao sistema <strong>Museus Centro / Viaduto das Artes</strong> já está liberado.</p>
<p>Recomendamos utilizar a entrada com Google para acesso mais rápido e seguro.</p>
<p><strong>Link de acesso:</strong><br>
<a href="${APP_URL}">${APP_URL}</a></p>
<p>Ao entrar, seu perfil já estará previamente aprovado.</p>
<p>Atenciosamente,<br><strong>Equipe Museus Centro</strong></p>
        `,
        from_name: 'Museus Centro'
      });
    } else {
      // Email padrão para demais aprovações automáticas
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: registration.email,
        subject: 'Acesso ao Sistema Museus Centro — Aprovado',
        body: `
<p>Olá, ${registration.full_name || 'usuário'}.</p>
<p>Seu acesso ao sistema <strong>Museus Centro / Viaduto das Artes</strong> foi aprovado automaticamente.</p>
<p>Recomendamos utilizar o login com Google para acesso mais rápido e seguro.</p>
<p><strong>Perfil atribuído:</strong> ${perfilLabel}</p>
<p><strong>Link de acesso:</strong><br>
<a href="${APP_URL}">${APP_URL}</a></p>
<p>Atenciosamente,<br><strong>Equipe Museus Centro</strong></p>
        `,
        from_name: 'Museus Centro'
      });
    }

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