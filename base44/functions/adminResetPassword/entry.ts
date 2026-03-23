import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return Response.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }
    
    // Buscar o usuário pelo email
    const users = await base44.asServiceRole.entities.User.filter({ email });
    
    if (!users || users.length === 0) {
      return Response.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }
    
    const user = users[0];
    
    // Atualizar a senha no User entity (se houver campo de senha)
    // Nota: Base44 gerencia senhas automaticamente, então fazemos via SDK
    await base44.asServiceRole.auth.changePassword(email, password);
    
    return Response.json({
      success: true,
      message: `Senha de ${email} resetada com sucesso para: ${password}`,
      email: email
    });
    
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({
      error: error.message || 'Erro ao resetar senha'
    }, { status: 500 });
  }
});