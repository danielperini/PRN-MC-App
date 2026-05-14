import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas admin pode rodar
    if (user?.role !== 'admin' && user?.email !== 'daniel@periniprojetos.com.br') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Buscar todos os usuários
    const allUsers = await base44.asServiceRole.entities.User.list();
    const existingPermissions = await base44.asServiceRole.entities.UserPermission.list();

    const existingEmails = new Set(existingPermissions.map(p => p.user_email?.toLowerCase()));
    
    // Filtrar usuários sem permissão
    const usersWithoutPermission = allUsers.filter(u => 
      !existingEmails.has(u.email?.toLowerCase())
    );

    // Criar permissões em batch
    const newPermissions = usersWithoutPermission.map(u => ({
      user_email: u.email,
      user_name: u.full_name,
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
    }));

    if (newPermissions.length === 0) {
      return Response.json({ 
        message: 'Todos os usuários já têm permissões',
        usersProcessed: 0 
      });
    }

    // Criar em batches pequenos para evitar timeout
    let created = 0;
    for (let i = 0; i < newPermissions.length; i += 10) {
      const batch = newPermissions.slice(i, i + 10);
      await base44.asServiceRole.entities.UserPermission.bulkCreate(batch);
      created += batch.length;
    }

    return Response.json({ 
      message: `Sincronização concluída`,
      usersWithoutPermission: usersWithoutPermission.length,
      permissionsCreated: created,
      userEmails: usersWithoutPermission.map(u => u.email)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});