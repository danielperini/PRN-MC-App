import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Apenas admin/coordenador pode alterar senha de outro usuário
    const isAdmin = ['ADMIN', 'admin', 'COORDENADOR'].includes(user.role);
    const isSelf = user.email === target_user_email;

    if (!isAdmin && !isSelf) {
      return Response.json({ error: 'Forbidden: Cannot change another user password' }, { status: 403 });
    }

    // Update user password via Base44 auth
    await base44.auth.changePassword(target_user_email, new_password);

    // Enviar email de aviso
    await base44.integrations.Core.SendEmail({
      to: target_user_email,
      subject: 'Sua senha foi alterada com sucesso',
      body: `Olá,\n\nInformamos que sua senha foi alterada com sucesso em ${new Date().toLocaleString('pt-BR')}.\n\nSe você não realizou esta alteração, entre em contato imediatamente com o administrador do sistema.\n\nAtenciosamente,\nPlataforma de Relatórios`
    });

    return Response.json({ 
      success: true, 
      message: 'Senha atualizada com sucesso. Email de confirmação enviado.',
      email: target_user_email
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});