import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { document_id, action } = body;

    if (!document_id || !action) {
      return Response.json({ error: 'Parâmetros obrigatórios faltam' }, { status: 400 });
    }

    // Ações permitidas
    const validActions = ['view', 'edit', 'approve', 'delete', 'reclassify', 'reprocess'];
    if (!validActions.includes(action)) {
      return Response.json({ error: 'Ação inválida' }, { status: 400 });
    }

    // Obter documento
    const document = await base44.asServiceRole.entities.DocumentIntake.filter({
      id: document_id
    });
    
    if (!document || document.length === 0) {
      return Response.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    const doc = document[0];

    // Obter permissões do usuário
    const userPerms = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: user.email
    });

    const perms = userPerms.length > 0 ? userPerms[0] : {};
    const isAdmin = user.role === 'admin';
    const isOwner = doc.created_by === user.email;
    const isCoordinator = perms.base_role === 'COORDENADOR';

    // Matriz de permissões
    const permissions = {
      view: isAdmin || isCoordinator || isOwner || perms.can_view_all_reports,
      edit: isAdmin || (isCoordinator && ['aguardando_revisao', 'rejeitado'].includes(doc.status)) || (isOwner && ['draft', 'pendente'].includes(doc.status)),
      approve: isAdmin || (isCoordinator && perms.pode_aprovar_solicitacoes && ['pronto_para_aprovacao'].includes(doc.status)),
      delete: isAdmin || (isCoordinator && perms.pode_gerenciar_rubricas) || (isOwner && ['draft', 'pendente'].includes(doc.status)),
      reclassify: isAdmin || (isCoordinator && perms.pode_gerenciar_rubricas && doc.status !== 'approved'),
      reprocess: isAdmin || (isCoordinator && perms.pode_gerenciar_rubricas && doc.status !== 'processing')
    };

    const hasPermission = permissions[action] || false;

    // Auditoria de tentativa de acesso
    if (!hasPermission) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'PERMISSION_DENIED',
        entity_type: 'DOCUMENT_INTAKE',
        entity_id: document_id,
        actor_email: user.email,
        actor_name: user.full_name,
        details: `Tentativa negada de ação '${action}' em documento. Status: ${doc.status}`
      });
    }

    return Response.json({
      has_permission: hasPermission,
      user_role: user.role,
      document_status: doc.status,
      action_requested: action,
      reason: !hasPermission ? getReasonMessage(action, doc.status, user.role, isOwner) : null,
      permissions_breakdown: permissions
    });

  } catch (error) {
    console.error('Erro ao verificar permissões:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getReasonMessage(action, status, role, isOwner) {
  const messages = {
    view: 'Você não tem permissão para visualizar este documento',
    edit: `Você não pode editar documento com status "${status}"`,
    approve: 'Apenas coordenadores com permissão de aprovação podem fazer isso',
    delete: 'Você não pode deletar documento com status diferente de draft/pendente',
    reclassify: 'Documento já foi processado/aprovado e não pode ser reclassificado',
    reprocess: 'Documento está em processamento. Aguarde conclusão'
  };
  return messages[action] || 'Permissão negada';
}