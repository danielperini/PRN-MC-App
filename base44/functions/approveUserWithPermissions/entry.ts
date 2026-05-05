import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas coordenadores e admins podem aprovar usuários
    if (!user || !['COORDENADOR', 'admin', 'ADMIN'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: apenas coordenadores podem aprovar' }, { status: 403 });
    }

    const { userRegistrationId, registrationData, permissions } = await req.json();

    if (!userRegistrationId) {
      return Response.json({ error: 'userRegistrationId obrigatório' }, { status: 400 });
    }

    // Buscar o registro de usuário
    const userReg = await base44.entities.UserRegistration.get(userRegistrationId);
    if (!userReg) {
      return Response.json({ error: 'UserRegistration não encontrado' }, { status: 404 });
    }

    // Convidar o usuário
    const newUser = await base44.users.inviteUser(userReg.email, 'COORDENADOR');

    // Criar registro de permissões customizadas
    if (permissions) {
      await base44.entities.UserPermission.create({
        user_email: userReg.email,
        user_name: userReg.full_name,
        base_role: 'COORDENADOR',
        can_view_all_reports: permissions.can_view_all_reports !== false,
        can_review_reports: permissions.can_review_reports !== false,
        can_manage_users: permissions.can_manage_users || false,
        can_manage_files: permissions.can_manage_files || false,
        can_manage_museus: permissions.can_manage_museus || false,
        can_manage_equipes: permissions.can_manage_equipes || false,
        can_view_audit_log: permissions.can_view_audit_log || false,
        can_manage_platform: permissions.can_manage_platform || false,
      });
    }

    // Atualizar status do registro
    await base44.entities.UserRegistration.update(userRegistrationId, {
      status: 'APROVADO',
      reviewer_note: 'Aprovado com permissões customizadas de coordenador restrito',
    });

    return Response.json({
      success: true,
      message: 'Usuário aprovado com permissões customizadas',
      user: newUser,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});