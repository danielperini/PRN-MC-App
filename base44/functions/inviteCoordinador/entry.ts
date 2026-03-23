import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !['ADMIN', 'admin', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const email = 'Josiane.c.amancio@gmail.com';
    const full_name = 'Josiane Amancio';
    const base_role = 'COORDENADOR';

    // Invite user
    await base44.users.inviteUser(email, 'admin');

    // Create user permission
    const permission = await base44.entities.UserPermission.create({
      user_email: email,
      user_name: full_name,
      base_role: base_role,
      can_manage_users: true,
      can_review_reports: true,
      must_submit_monthly_report: false,
      can_view_all_reports: true,
      can_manage_equipes: true,
      can_manage_museus: true,
      can_manage_files: true,
      can_manage_platform: false,
      can_view_audit_log: true
    });

    return Response.json({ 
      success: true, 
      message: 'Coordenador cadastrado com sucesso',
      email: email,
      permission: permission
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});