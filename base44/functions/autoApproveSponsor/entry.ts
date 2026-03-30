import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apenas usuários @pbh.gov.br
    if (!user.email?.toLowerCase().endsWith('@pbh.gov.br')) {
      return Response.json({ error: 'Domain not approved for auto-approval' }, { status: 403 });
    }

    // Verifica se UserPermission já existe
    const existing = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: user.email,
    });

    if (existing && existing.length > 0) {
      return Response.json({ message: 'User already has permissions', existing: existing[0] });
    }

    // Criar permissões de PATROCINADOR para usuários @pbh.gov.br
    const permissions = {
      user_email: user.email,
      user_name: user.full_name || 'Patrocinador',
      base_role: 'PATROCINADOR',
      can_view_sponsor_dashboard: true,
      can_view_approved_reports: true,
      can_view_approved_programacao: true,
      can_view_public_gallery: true,
      can_view_budget_summary: true,
      can_view_project_kpis: true,
      can_manage_users: false,
      can_manage_platform: false,
      can_manage_files: false,
      can_manage_equipes: false,
      can_review_reports: false,
      gestao_compras: false,
      can_view_audit_log: false,
    };

    const created = await base44.asServiceRole.entities.UserPermission.create(permissions);

    return Response.json({
      success: true,
      message: 'Sponsor permissions granted',
      permissions: created,
    });
  } catch (error) {
    console.error('autoApproveSponsor error:', error);
    return Response.json({ error: error?.message || String(error), success: false }, { status: 500 });
  }
});