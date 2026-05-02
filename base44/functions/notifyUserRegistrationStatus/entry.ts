import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    if (!event || event.type !== 'update') {
      return Response.json({ success: true });
    }

    const registration = event.data;
    if (!registration || !registration.status || !['APROVADO', 'REJEITADO'].includes(registration.status)) {
      return Response.json({ success: true });
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://app.example.com';
    const isApproved = registration.status === 'APROVADO';
    
    let emailBody;
    let subject;

    if (isApproved) {
      const loginLink = `${appUrl}/login`;
      subject = 'Sua Solicitação de Acesso foi Aprovada!';
      emailBody = `
<h2>Solicitação Aprovada! 🎉</h2>
<p>Olá ${registration.full_name},</p>

<p>Sua solicitação de acesso à plataforma foi <strong>aprovada</strong>!</p>

<div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
  <p><strong>Seus dados:</strong></p>
  <p>Email: ${registration.email}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu}</p>
</div>

<p>Você já pode acessar a plataforma clicando no botão abaixo:</p>

<p style="margin: 30px 0;">
  <a href="${loginLink}" style="background: #10b981; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
    Acessar Plataforma
  </a>
</p>

<p style="color: #666; font-size: 14px;">
  Se tiver dúvidas, entre em contato com um coordenador.
</p>
      `;
    } else {
      subject = 'Sua Solicitação de Acesso foi Rejeitada';
      emailBody = `
<h2>Solicitação não Aprovada</h2>
<p>Olá ${registration.full_name},</p>

<p>Sua solicitação de acesso à plataforma foi <strong>rejeitada</strong>.</p>

<div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
  <p><strong>Informações da solicitação:</strong></p>
  <p>Email: ${registration.email}</p>
  <p>Função: ${registration.funcao || 'Não informado'}</p>
  <p>Museu: ${registration.museu}</p>
  ${registration.reviewer_note ? `<p style="margin-top: 15px;"><strong>Observação:</strong> ${registration.reviewer_note}</p>` : ''}
</div>

<p>Se acredita que houve um erro, entre em contato com um coordenador para mais informações.</p>
      `;
    }

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (registration.email !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', registration.email);
      return Response.json({ success: true, skipped: true });
    }
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: registration.email,
      subject: subject,
      body: emailBody,
      from_name: 'Plataforma de Relatórios'
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro ao notificar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});