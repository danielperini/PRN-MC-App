import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem executar esta ação' }, { status: 403 });
    }
    
    // Buscar todos os usuários com role COORDENADOR
    const allUsers = await base44.asServiceRole.entities.User.list('', 9999);
    const coordenadores = allUsers.filter(u => u.role === 'COORDENADOR');
    
    // Buscar permissões existentes
    const existingPerms = await base44.asServiceRole.entities.UserPermission.list('', 9999);
    
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
    
    const results = [];
    
    for (const coordenador of coordenadores) {
      const existing = existingPerms.find(p => p.user_email === coordenador.email);
      
      if (existing) {
        // Atualizar permissões existentes
        await base44.asServiceRole.entities.UserPermission.update(existing.id, adminPermissions);
        results.push({
          email: coordenador.email,
          name: coordenador.full_name,
          action: 'updated'
        });
      } else {
        // Criar novas permissões
        await base44.asServiceRole.entities.UserPermission.create({
          user_email: coordenador.email,
          user_name: coordenador.full_name,
          base_role: 'COORDENADOR',
          ...adminPermissions
        });
        results.push({
          email: coordenador.email,
          name: coordenador.full_name,
          action: 'created'
        });
      }
    }
    
    return Response.json({
      success: true,
      message: `Permissões de admin atribuídas a ${coordenadores.length} coordenador(es)`,
      results
    });
    
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({
      error: error.message || 'Erro ao atribuir permissões'
    }, { status: 500 });
  }
});