import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email, full_name, role, inviteUrl } = body;

    if (!email || !inviteUrl) {
      return Response.json({ error: 'Email e inviteUrl são obrigatórios' }, { status: 400 });
    }

    // Buscar configuração de email para convites
    const emailConfigs = await base44.asServiceRole.entities.EmailConfig.filter({ 
      tipo: 'convites', 
      ativo: true 
    });

    if (emailConfigs.length === 0) {
      return Response.json({ error: 'Nenhuma configuração de email de convites encontrada' }, { status: 500 });
    }

    const emailConfig = emailConfigs[0];

    // Enviar email de convite
    const message = `Olá ${full_name || 'usuário'}!

Você foi convidado para acessar a Plataforma de Relatórios dos Museus Centro.

Para aceitar o convite, clique no link abaixo:
${inviteUrl}

Se você não solicitou este convite, favor desconsiderar este email.

Atenciosamente,
Equipe da Plataforma`;

    await base44.integrations.Core.SendEmail({
      from_name: emailConfig.nome_sender || 'Plataforma de Relatórios',
      to: email,
      subject: 'Convite para acessar a Plataforma de Relatórios',
      body: message
    });

    return Response.json({ 
      success: true, 
      message: 'Email de convite enviado com sucesso',
      from: emailConfig.email_sender
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});