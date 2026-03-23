import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admins podem executar esta ação' }, { status: 403 });
    }
    
    const { email } = await req.json();
    
    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }
    
    // Buscar usuário existente
    const users = await base44.asServiceRole.entities.User.filter({ email });
    
    if (users && users.length > 0) {
      // Atualizar para admin
      const existingUser = users[0];
      await base44.asServiceRole.entities.User.update(existingUser.id, { role: 'admin' });
      
      return Response.json({
        success: true,
        message: `Usuário ${email} atualizado para admin`,
        email: email,
        role: 'admin'
      });
    }
    
    return Response.json({
      message: 'Usuário não encontrado. Convide o usuário primeiro no dashboard.',
      email: email
    }, { status: 404 });
    
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({
      error: error.message || 'Erro ao configurar admin'
    }, { status: 500 });
  }
});