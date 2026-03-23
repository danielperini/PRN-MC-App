import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Garantir que Daniel Perini tem permissões ilimitadas
    const danialEmail = 'daniel@periniprojetos.com.br';
    
    // Buscar usuário
    const users = await base44.asServiceRole.entities.User.filter({ email: danialEmail });
    if (!users || users.length === 0) {
      return Response.json({ status: 'user_not_found' });
    }

    const user = users[0];

    // Buscar permissões existentes
    let perms = await base44.asServiceRole.entities.UserPermission.filter({ user_email: danialEmail });
    
    // Buscar todos os tipos de permissão
    const permTypes = await base44.asServiceRole.entities.PermissionType.list('', 1000);
    
    // Preparar todas as permissões habilitadas
    const allPermsObj = {
      user_email: danialEmail,
      user_name: user.full_name || 'Daniel Perini',
      base_role: 'COORDENADOR',
      can_view_all_reports: true,
      can_review_reports: true,
      can_manage_users: true,
      can_manage_files: true,
      can_manage_museus: true,
      can_manage_equipes: true,
      can_view_audit_log: true,
      can_manage_platform: true,
    };

    // Adicionar todas as permissões customizadas
    permTypes.forEach(pt => {
      if (pt.ativo) {
        allPermsObj[pt.key] = true;
      }
    });

    // Criar ou atualizar
    if (!perms || perms.length === 0) {
      await base44.asServiceRole.entities.UserPermission.create(allPermsObj);
      return Response.json({ status: 'created', email: danialEmail });
    } else {
      await base44.asServiceRole.entities.UserPermission.update(perms[0].id, allPermsObj);
      return Response.json({ status: 'updated', email: danialEmail });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});