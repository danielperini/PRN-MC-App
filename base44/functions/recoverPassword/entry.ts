import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Gera uma senha temporária aleatória
function generateTempPassword() {
  const length = 12;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Buscar usuário por email
    const users = await base44.entities.User.list(null, 1000);
    const userExists = users.find(u => u.email === email);

    if (!userExists) {
      // Por segurança, não revelamos se o email existe ou não
      return Response.json({ 
        success: true, 
        message: 'Se o email existe na plataforma, uma nova senha será enviada.' 
      });
    }

    // Gerar senha temporária
    const tempPassword = generateTempPassword();

    // Alterar a senha do usuário
    await base44.auth.changePassword(email, tempPassword);

    // Enviar email com a senha temporária
    await base44.integrations.Core.SendEmail({
      to: email,
      subject: 'Sua senha temporária - Plataforma de Relatórios',
      body: `Olá,\n\nRecebemos uma solicitação para recuperação de senha. Aqui está sua senha temporária:\n\n${tempPassword}\n\nPor segurança, recomendamos que você altere esta senha assim que fizer login.\n\nSe você não solicitou esta recuperação, ignore este email.\n\nAtenciosamente,\nPlataforma de Relatórios`
    });

    return Response.json({ 
      success: true, 
      message: 'Se o email existe na plataforma, uma nova senha será enviada.' 
    });
  } catch (error) {
    console.error('Erro ao recuperar senha:', error);
    return Response.json({ 
      error: error.message || 'Erro ao processar solicitação' 
    }, { status: 500 });
  }
});