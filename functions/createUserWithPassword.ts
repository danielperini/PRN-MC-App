import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !['ADMIN', 'admin', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email, full_name, role, password } = await req.json();

    if (!email || !full_name || !role || !password) {
      return Response.json({ 
        error: 'Missing required fields: email, full_name, role, password' 
      }, { status: 400 });
    }

    // Invite user first — platform only accepts "user" or "admin"
    const platformRole = role === 'ADMIN' ? 'admin' : 'user';
    await base44.users.inviteUser(email, platformRole);

    // Create user permission based on role
    const permissionDefaults = {
      'PROFISSIONAL': {
        can_view_all_reports: false,
        can_review_reports: false,
        can_manage_users: false,
        can_manage_files: false,
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

    const permissions = await base44.entities.UserPermission.create({
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});