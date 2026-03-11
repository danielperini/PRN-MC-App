import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchase_id, purchase_description, requester_name, requester_email, amount } = await req.json();

    if (!purchase_id || !requester_name || !requester_email || !amount) {
      return Response.json({ error: 'Parâmetros obrigatórios faltando' }, { status: 400 });
    }

    const coordinators = await base44.asServiceRole.entities.UserPermission.list('', 9999);
    const coordinatorEmails = coordinators
      .filter(p => p.can_review_reports || p.pode_aprovar_solicitacoes)
      .map(p => p.user_email)
      .filter(Boolean);

    if (coordinatorEmails.length === 0) {
      return Response.json({ success: false, message: 'Nenhum coordenador encontrado' }, { status: 200 });
    }

    for (const coordinatorEmail of coordinatorEmails) {
      await base44.integrations.Core.SendEmail({
        to: coordinatorEmail,
        subject: `📋 Nova Solicitação de Compra: ${purchase_description || 'Sem descrição'}`,
        body: `Olá Coordenador,\n\nUma nova solicitação de compra foi enviada:\n\n` +
              `📝 Descrição: ${purchase_description || 'Sem descrição'}\n` +
              `💰 Valor: R$ ${amount.toFixed(2)}\n` +
              `👤 Solicitante: ${requester_name} (${requester_email})\n\n` +
              `Acesse a plataforma para revisar e aprovar.\n\nPlataforma Museus Centro`,
      });
    }

    return Response.json({ success: true, message: 'Notificações enviadas aos coordenadores' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});