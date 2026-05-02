import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    if (!event || event.type !== 'create') {
      return Response.json({ success: true });
    }

    const registration = event.data;
    if (!registration) {
      return Response.json({ success: true });
    }

    // Buscar coordenadores para notificar
    const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'COORDENADOR' });
    
    if (adminUsers.length === 0) {
      return Response.json({ success: true });
    }

    const approvalLink = `${Deno.env.get('APP_URL') || 'https://app.example.com'}/admin-users`;
    
    const emailBody = `
<h2>Nova Solicitação de Acesso</h2>
<p>Um novo usuário solicitou acesso à plataforma:</p>

<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <p><strong>Nome:</strong> ${registration.full_name}</p>
  <p><strong>Email:</strong> ${registration.email}</p>
  <p><strong>Função:</strong> ${registration.funcao || 'Não informado'}</p>
  <p><strong>Museu:</strong> ${registration.museu}</p>
  <p><strong>Equipe:</strong> ${registration.equipe || 'Não informado'}</p>
  ${registration.mensagem ? `<p><strong>Mensagem:</strong> ${registration.mensagem}</p>` : ''}
</div>

<p>
  <a href="${approvalLink}" style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
    Revisar Solicitação
  </a>
</p>

<p style="color: #999; font-size: 12px; margin-top: 30px;">
  Solicitação ID: ${event.entity_id}
</p>
    `;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    const allowedAdmins = adminUsers.filter(a => {
      if (a.email !== ALLOWED_EMAIL) { console.log('Email bloqueado:', a.email); return false; }
      return true;
    });

    // Enviar email para cada coordenador
    const emailPromises = allowedAdmins.map(admin => 
      base44.asServiceRole.integrations.Core.SendEmail({
        to: admin.email,
        subject: `Nova Solicitação de Acesso - ${registration.full_name}`,
        body: emailBody,
        from_name: 'Plataforma de Relatórios'
      })
    );

    await Promise.all(emailPromises);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro ao notificar admin:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});