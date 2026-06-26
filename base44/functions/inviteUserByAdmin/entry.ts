import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Apenas admin pode convidar usuários
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email, nome, role = 'user' } = await req.json();
    
    if (!email || !nome) {
      return Response.json({ error: 'email e nome são obrigatórios' }, { status: 400 });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Email inválido' }, { status: 400 });
    }

    // Verificar se usuário já existe
    const existingPermissions = await base44.entities.UserPermission.filter({ user_email: email });
    if (existingPermissions && existingPermissions.length > 0) {
      return Response.json({ 
        success: false, 
        message: 'Usuário já possui permissões no sistema',
        existing: existingPermissions[0]
      });
    }

    // Convidar usuário
    await base44.users.inviteUser(email, role);

    // Criar permissões básicas
    const permission = await base44.entities.UserPermission.create({
      user_email: email,
      user_name: nome,
      base_role: role === 'admin' ? 'ADMIN' : 'COORDENADOR',
      can_review_reports: true,
      can_view_all_reports: true,
      can_manage_files: true,
      can_view_audit_log: true,
      gestao_compras: role === 'admin',
      pode_aprovar_solicitacoes: role === 'admin',
      pode_gerenciar_rubricas: role === 'admin'
    });

    return Response.json({ 
      success: true, 
      message: `Usuário ${nome} convidado com sucesso`,
      email: email,
      permission: permission
    });
  } catch (error) {
    console.error('Erro ao convidar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});