import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    if (!event || event.type !== 'update') {
      return Response.json({ success: true });
    }

    const registration = event.data;
    if (!registration || registration.status !== 'APROVADO') {
      return Response.json({ success: true });
    }

    const appUrl = 'https://app.base44.com';

    const emailBody = `
<h2>Solicitação Aprovada! 🎉</h2>
<p>Olá ${registration.full_name},</p>

<p>Sua solicitação de acesso à plataforma foi <strong>aprovada</strong> por um coordenador!</p>

<div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
  <p><strong>Seus dados:</strong></p>
  <p>Email: ${registration.email}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu}</p>
</div>

<p>Você já pode acessar a plataforma agora:</p>

<p style="margin: 30px 0;">
  <a href="${appUrl}" style="background: #10b981; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
    Acessar Plataforma
  </a>
</p>

<p style="color: #666; font-size: 14px;">
  Se tiver dúvidas, entre em contato com um coordenador ou responda este e-mail.
</p>
    `;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (registration.email !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', registration.email);
      return Response.json({ success: true, skipped: true });
    }
    // Enviar e-mail de confirmação
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: registration.email,
      subject: 'Sua Solicitação de Acesso foi Aprovada!',
      body: emailBody,
      from_name: 'Plataforma de Relatórios - danielperini@viadutodasartes.org.br'
    });

    // Criar notificação no sistema
    await base44.asServiceRole.entities.Notification.create({
      user_email: registration.email,
      type: 'REGISTRATION_APPROVED',
      title: 'Solicitação aprovada',
      message: 'Sua solicitação de acesso foi aprovada. Você já pode acessar a plataforma.',
      action_url: appUrl,
      read: false,
      email_sent: true
    });

    console.log(`[APPROVAL] Confirmação de aprovação enviada para ${registration.email}`);

    return Response.json({ 
      success: true, 
      message: 'E-mail de confirmação enviado'
    });
  } catch (error) {
    console.error('Erro ao enviar confirmação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});