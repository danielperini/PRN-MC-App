import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !['ADMIN', 'admin', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { target_user_email, new_password } = await req.json();

    if (!target_user_email || !new_password) {
      return Response.json({ 
        error: 'Missing required fields: target_user_email, new_password' 
      }, { status: 400 });
    }

    if (new_password.length < 8) {
      return Response.json({ 
        error: 'Senha deve ter no mínimo 8 caracteres' 
      }, { status: 400 });
    }

    // Update user password via Base44 auth
    const updatedUser = await base44.auth.changePassword(target_user_email, new_password);

    return Response.json({ 
      success: true, 
      message: 'Senha atualizada com sucesso',
      email: target_user_email
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});