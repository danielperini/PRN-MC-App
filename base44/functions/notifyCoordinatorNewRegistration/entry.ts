import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    if (!event || event.type !== 'create') {
      return Response.json({ success: true });
    }

    const registration = event.data;
    if (!registration || !registration.email) {
      return Response.json({ success: true });
    }

    // Verificar se é domínio permitido (auto-aprovado)
    const allowedDomains = ['@viadutodasartes.org.br', '@periniprojetos.com.br'];
    const isAllowedDomain = allowedDomains.some(domain => 
      registration.email.toLowerCase().endsWith(domain)
    );

    // Se foi auto-aprovado, não precisa notificar coordenador
    if (isAllowedDomain) {
      return Response.json({ success: true, message: 'Auto-aprovado, sem notificação necessária' });
    }

    // Buscar coordenadores
    const coordinators = await base44.asServiceRole.entities.UserPermission.filter({
      base_role: 'COORDENADOR'
    }, '-created_date', 100);

    if (!coordinators || coordinators.length === 0) {
      console.log('Nenhum coordenador encontrado');
      return Response.json({ success: true });
    }

    // Enviar e-mail para cada coordenador
    const emailBody = `
<h2>Nova Solicitação de Acesso Pendente</h2>
<p>Uma nova solicitação de acesso foi recebida e aguarda sua análise.</p>

<div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1f2937;">
  <p><strong>Informações do Solicitante:</strong></p>
  <p><strong>Nome:</strong> ${registration.full_name}</p>
  <p><strong>Email:</strong> ${registration.email}</p>
  <p><strong>Função:</strong> ${registration.funcao || 'Não informado'}</p>
  <p><strong>Museu:</strong> ${registration.museu}</p>
  <p><strong>Equipe:</strong> ${registration.equipe || 'Não informado'}</p>
  ${registration.mensagem ? `<p><strong>Mensagem:</strong> ${registration.mensagem}</p>` : ''}
</div>

<p><a href="https://app.base44.com/admin" style="background: #1f2937; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
  Revisar Solicitação
</a></p>

<p style="color: #666; font-size: 14px; margin-top: 30px;">
  Esta é uma notificação automática. Não responda este e-mail.
</p>
    `;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    for (const coordinator of coordinators) {
      if (coordinator.user_email !== ALLOWED_EMAIL) { console.log('Email bloqueado:', coordinator.user_email); continue; }
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: coordinator.user_email,
        subject: `Nova Solicitação de Acesso - ${registration.full_name}`,
        body: emailBody,
        from_name: 'Plataforma de Relatórios - danielperini@viadutodasartes.org.br'
      });
    }

    // Criar notificação no sistema
    for (const coordinator of coordinators) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: coordinator.user_email,
        type: 'USER_APPROVAL_PENDING',
        title: 'Nova solicitação de acesso',
        message: `${registration.full_name} (${registration.email}) solicitou acesso à plataforma`,
        action_url: '/admin',
        read: false,
        email_sent: true
      });
    }

    console.log(`[NOTIFICATION] Coordenadores notificados sobre ${registration.email}`);

    return Response.json({ 
      success: true, 
      message: 'Coordenadores notificados',
      coordinatorsNotified: coordinators.length
    });
  } catch (error) {
    console.error('Erro ao notificar coordenador:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});