import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_PROFISSIONAL_PERMISSIONS = {
  base_role: 'PROFISSIONAL',
  can_view_all_reports: true,
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
  can_view_sponsor_dashboard: false,
  can_view_approved_reports: false,
  can_view_approved_programacao: false,
  can_view_public_gallery: false,
  can_view_budget_summary: false,
  can_view_project_kpis: false,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin' && user?.email !== 'daniel@periniprojetos.com.br') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { user_email, user_name } = await req.json().catch(() => ({}));

    if (!user_email) {
      return Response.json({ error: 'user_email is required' }, { status: 400 });
    }

    // Verificar se permissão existe
    const existing = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: user_email.toLowerCase(),
    });

    if (existing.length > 0) {
      return Response.json({ 
        message: 'Permission already exists',
        email: user_email 
      });
    }

    // Criar nova permissão
    await base44.asServiceRole.entities.UserPermission.create({
      user_email: user_email.toLowerCase(),
      user_name: user_name || '',
      ...DEFAULT_PROFISSIONAL_PERMISSIONS,
    });

    return Response.json({ 
      message: 'Permission created',
      email: user_email,
      role: 'PROFISSIONAL'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});