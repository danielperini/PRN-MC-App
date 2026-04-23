import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function isAllowedDirectUserDomain(email: string) {
  const normalized = normalizeEmail(email);

  if (!normalized) return false;

  return (
    normalized.endsWith('@pbh.gov.br') ||
    normalized.endsWith('@viadutodasartes.org.br') ||
    normalized.endsWith('@periniprojetos.com.br')
  );
}

function getPermissionDefaults(role: string) {
  const defaults: Record<string, any> = {
    PROFISSIONAL: {
      can_view_all_reports: false,
      can_review_reports: false,
      can_manage_users: false,
      can_manage_files: false,
      can_manage_museus: false,
      can_manage_equipes: false,
      can_view_audit_log: false,
      can_manage_platform: false,
      must_submit_monthly_report: true,
    },
    COORDENADOR: {
      can_view_all_reports: true,
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_manage_museus: true,
      can_manage_equipes: true,
      can_view_audit_log: true,
      can_manage_platform: false,
      must_submit_monthly_report: false,
    },
    ADMIN: {
      can_view_all_reports: true,
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_manage_museus: true,
      can_manage_equipes: true,
      can_view_audit_log: true,
      can_manage_platform: true,
      must_submit_monthly_report: false,
    },
  };

  return defaults[role] || defaults.PROFISSIONAL;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email || '');
    const full_name = String(body?.full_name || '').trim();
    const museu = String(body?.museu || '').trim();
    const funcao = String(body?.funcao || '').trim();
    const equipe = String(body?.equipe || '').trim();
    const password = String(body?.password || '');
    const role = String(body?.role || 'PROFISSIONAL').trim().toUpperCase();

    if (!email || !full_name || !password) {
      return Response.json(
        { error: 'Campos obrigatórios: email, full_name, password' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: 'A senha deve ter no mínimo 8 caracteres.' },
        { status: 400 }
      );
    }

    const me = await base44.auth.me().catch(() => null);
    const isAdmin = !!me && me.role === 'admin';
    const allowedSelfRegistration = isAllowedDirectUserDomain(email);

    if (!isAdmin && !allowedSelfRegistration) {
      return Response.json(
        {
          error:
            'Cadastro direto com senha não permitido para este domínio. Use o fluxo de solicitação.',
        },
        { status: 403 }
      );
    }

    const existingPermissions = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: email,
    });

    if (existingPermissions && existingPermissions.length > 0) {
      return Response.json(
        { error: 'Já existe um usuário/permissão cadastrada para este e-mail.' },
        { status: 409 }
      );
    }

    const existingRegistrations = await base44.asServiceRole.entities.UserRegistration.filter({
      email,
    });

    const platformRole = role === 'ADMIN' ? 'admin' : 'user';

    await base44.asServiceRole.auth.createUserWithPassword(
      email,
      full_name,
      password,
      platformRole
    );

    const permissions = await base44.asServiceRole.entities.UserPermission.create({
      user_email: email,
      user_name: full_name,
      base_role: role === 'ADMIN' ? 'ADMIN' : 'PROFISSIONAL',
      museu,
      funcao,
      equipe,
      ...getPermissionDefaults(role === 'ADMIN' ? 'ADMIN' : 'PROFISSIONAL'),
    });

    if (existingRegistrations && existingRegistrations.length > 0) {
      await Promise.all(
        existingRegistrations.map((registration: any) =>
          base44.asServiceRole.entities.UserRegistration.update(registration.id, {
            status: 'APROVADO',
            reviewer_note: 'Cadastro direto com senha concluído automaticamente',
          })
        )
      );
    }

    return Response.json({
      success: true,
      message: 'Usuário criado com senha com sucesso.',
      email,
      full_name,
      role: role === 'ADMIN' ? 'ADMIN' : 'PROFISSIONAL',
      permission_id: permissions.id,
      autoApproved: allowedSelfRegistration,
    });
  } catch (error: any) {
    console.error('Error creating user with password:', error);
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
});        can_manage_files: false,
        can_manage_museus: false,
        can_manage_equipes: false,
        can_view_audit_log: false,
        can_manage_platform: false,
        must_submit_monthly_report: true
      },
      'COORDENADOR': {
        can_view_all_reports: true,
        can_review_reports: true,
        can_manage_users: true,
        can_manage_files: true,
        can_manage_museus: true,
        can_manage_equipes: true,
        can_view_audit_log: true,
        can_manage_platform: false,
        must_submit_monthly_report: false
      },
      'ADMIN': {
        can_view_all_reports: true,
        can_review_reports: true,
        can_manage_users: true,
        can_manage_files: true,
        can_manage_museus: true,
        can_manage_equipes: true,
        can_view_audit_log: true,
        can_manage_platform: true,
        must_submit_monthly_report: false
      }
    };

    const permissions = await base44.asServiceRole.entities.UserPermission.create({
      user_email: email,
      user_name: full_name,
      base_role: role,
      ...permissionDefaults[role]
    });

    return Response.json({ 
      success: true, 
      message: 'Usuário cadastrado com sucesso',
      email: email,
      full_name: full_name,
      role: role,
      permission_id: permissions.id
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
