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

    if (!userRegistrationId && !registrationData?.email) {
      return Response.json({ error: 'userRegistrationId ou registrationData.email obrigatório' }, { status: 400 });
    }

    // Buscar o registro de usuário
    let userReg = null;

    if (userRegistrationId) {
      userReg = await base44.entities.UserRegistration.get(userRegistrationId);
    }

    if (!userReg && registrationData?.email) {
      const found = await base44.entities.UserRegistration.filter({
        email: registrationData.email
      });
      userReg = found?.[0] || null;
    }

    if (!userReg) {
      return Response.json({ error: 'UserRegistration não encontrado' }, { status: 404 });
    }

    const approvedRole = permissions?.base_role || registrationData?.base_role || 'COORDENADOR';

    // Convidar o usuário
    const newUser = await base44.users.inviteUser(userReg.email, approvedRole);

    // Criar registro de permissões customizadas
    if (permissions) {
      const existingPermissions = await base44.entities.UserPermission.filter({
        user_email: userReg.email
      });

      const permissionPayload = {
        user_email: userReg.email,
        user_name: userReg.full_name,
        base_role: approvedRole,
        can_view_all_reports: permissions.can_view_all_reports !== false,
        can_review_reports: permissions.can_review_reports !== false,
        can_manage_users: permissions.can_manage_users || false,
        can_manage_files: permissions.can_manage_files || false,
        can_manage_museus: permissions.can_manage_museus || false,
        can_manage_equipes: permissions.can_manage_equipes || false,
        can_view_audit_log: permissions.can_view_audit_log || false,
        can_manage_platform: permissions.can_manage_platform || false,
      };

      if (existingPermissions?.length > 0) {
        await base44.entities.UserPermission.update(existingPermissions[0].id, permissionPayload);
      } else {
        await base44.entities.UserPermission.create(permissionPayload);
      }
    }

    // Atualizar status do registro
    await base44.entities.UserRegistration.update(userReg.id || userRegistrationId, {
      status: 'APROVADO',
      reviewer_note: 'Aprovado com permissões customizadas',
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
