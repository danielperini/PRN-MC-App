import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const email = 'danielperini.mc@viadutodasartes.org.br';
    const newPassword = 'viaduto';
    
    // Usar changeUserPassword para resetar a senha
    const result = await base44.asServiceRole.functions.invoke('changeUserPassword', {
      user_email: email,
      new_password: newPassword
    });
    
    return Response.json({
      success: true,
      message: 'Senha de Daniel resetada com sucesso',
      email: email
    });
    
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({
      error: error.message || 'Erro ao resetar senha'
    }, { status: 500 });
  }
});