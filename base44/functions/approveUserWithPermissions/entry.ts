import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function normalizeEmail(email: any): string {
  return String(email || '').trim().toLowerCase();
}

function rolePayload(role: string) {
  return {
    base_role: role,
    status: 'ATIVO',
    can_review_reports: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_users: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_files: role === 'COORDENADOR' || role === 'ADMIN',
    can_view_audit_log: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_platform: role === 'ADMIN',
    gestao_compras: role === 'COORDENADOR' || role === 'ADMIN',
    pode_aprovar_solicitacoes: role === 'COORDENADOR' || role === 'ADMIN',
    must_submit_monthly_reports: role === 'PROFISSIONAL',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { userRegistrationId } = body;

    if (!userRegistrationId) {
      return json({ success: false, error: 'userRegistrationId obrigatório.' }, 400);
    }

    const userReg = await base44.asServiceRole.entities.UserRegistration.get(userRegistrationId);

    if (!userReg) {
      return json({ success: false, error: 'Solicitação não encontrada.' }, 404);
    }

    const email = normalizeEmail(userReg.email);
    const role = String(
      body.role ||
      body.permissions?.base_role ||
      userReg.role_aprovada ||
      'PROFISSIONAL'
    ).trim().toUpperCase();

    const permissionsPayload = {
      ...rolePayload(role),
      ...(body.permissions || {}),
      user_email: email,
      user_name: userReg.full_name || userReg.nome || email,
      funcao: userReg.funcao || '',
      equipe: userReg.equipe || '',
      area: userReg.area || userReg.museu || '',
      museu: userReg.area || userReg.museu || '',
      registration_id: userReg.id,
    };

    const existingPermissions = await base44.asServiceRole.entities.UserPermission
      .filter({ user_email: email })
      .catch(() => []);

    if (existingPermissions?.[0]?.id) {
      await base44.asServiceRole.entities.UserPermission.update(
        existingPermissions[0].id,
        permissionsPayload
      );
    } else {
      await base44.asServiceRole.entities.UserPermission.create(permissionsPayload);
    }

    try {
      await base44.asServiceRole.users.inviteUser(email, role === 'ADMIN' ? 'admin' : 'user');
    } catch (inviteError) {
      console.warn('Convite não enviado ou usuário já existente:', inviteError?.message || inviteError);
    }

    await base44.asServiceRole.entities.UserRegistration.update(userRegistrationId, {
      status: 'APROVADO',
      aprovado_em: new Date().toISOString(),
      role_aprovada: role,
      reviewer_note: 'Aprovado pela coordenação com permissões definidas.',
    });

    return json({
      success: true,
      message: 'Usuário aprovado com permissões.',
      email,
      role,
    });
  } catch (error: any) {
    console.error('approveUserWithPermissions error:', error);

    return json({
      success: false,
      error: error?.message || 'Erro ao aprovar usuário.'
    }, 500);
  }
});
