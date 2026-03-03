import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    const { event, data } = payload;
    
    // Only process create events
    if (event.type !== 'create') {
      return Response.json({ success: true });
    }

    const registration = data;

    // Get all coordinators
    const users = await base44.asServiceRole.entities.User.list();
    const coordinators = users.filter(u => u.role === 'COORDENADOR' || u.role === 'admin' || u.role === 'ADMIN');

    // Send notification to each coordinator
    for (const coordinator of coordinators) {
      await base44.integrations.Core.SendEmail({
        to: coordinator.email,
        subject: `Nova solicitação de cadastro: ${registration.full_name}`,
        body: `Olá ${coordinator.full_name},\n\nUma nova solicitação de cadastro foi recebida:\n\n` +
          `Nome: ${registration.full_name}\n` +
          `Email: ${registration.email}\n` +
          `Função: ${registration.funcao}\n` +
          `Museu: ${registration.museu}\n` +
          `Equipe: ${registration.equipe || 'Não informada'}\n` +
          `Mensagem: ${registration.mensagem || 'Sem mensagem'}\n\n` +
          `Por favor, acesse o painel de administração para revisar e aprovar/rejeitar esta solicitação.\n\n` +
          `Atenciosamente,\nSistema de Gestão de Museus`
      });
    }

    return Response.json({ success: true, notifiedCoordinators: coordinators.length });
  } catch (error) {
    console.error('Erro ao notificar coordenadores:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});