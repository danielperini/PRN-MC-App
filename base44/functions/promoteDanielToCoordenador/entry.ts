import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const email = 'danielperini.mc@viadutodasartes.org.br';
    
    // Buscar permissões existentes do Daniel
    const existingPerms = await base44.asServiceRole.entities.UserPermission.filter({ user_email: email });
    
    const adminPermissions = {
      can_view_all_reports: true,
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_manage_museus: true,
      can_manage_equipes: true,
      can_view_audit_log: true,
      can_manage_platform: true,
      gestao_compras: true,
      must_submit_monthly_reports: false,
    };
    
    if (existingPerms && existingPerms.length > 0) {
      // Atualizar permissões existentes
      const perm = existingPerms[0];
      await base44.asServiceRole.entities.UserPermission.update(perm.id, adminPermissions);
      return Response.json({
        success: true,
        message: 'Permissões de Daniel atualizadas com sucesso',
        email: email,
        action: 'updated'
      });
    } else {
      // Criar novas permissões
      await base44.asServiceRole.entities.UserPermission.create({
        user_email: email,
        user_name: 'Daniel Perini',
        base_role: 'COORDENADOR',
        ...adminPermissions
      });
      return Response.json({
        success: true,
        message: 'Permissões de admin criadas para Daniel com sucesso',
        email: email,
        action: 'created'
      });
    }
    
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({
      error: error.message || 'Erro ao promover Daniel'
    }, { status: 500 });
  }
});