import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, userEmail } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
    }

    // Buscar dados da compra
    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ error: 'PurchaseRequest não encontrado' }, { status: 404 });
    }

    const purchaseData = purchase;

    // Buscar coordenador geral para notificação
    const permissions = await base44.asServiceRole.entities.UserPermission.filter({ 
      base_role: 'COORDENADOR',
      can_review_reports: true 
    });
    
    const coords = permissions.filter(p => p.user_email !== userEmail);

    if (coords.length === 0) {
      console.log('Nenhum coordenador encontrado para notificação');
      return Response.json({ success: true, notified: 0 });
    }

    // Criar notificações para cada coordenador
    const notifications = coords.map(coord => ({
      user_email: coord.user_email,
      type: 'PURCHASE_AWAITING_APPROVAL',
      title: 'Nova Solicitação de Compra para Aprovação',
      message: `Solicitação de compra "${purchaseData.descricao_item}" (R$ ${(purchaseData.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) aguardando sua aprovação.`,
      purchase_id: purchaseId,
      action_url: `/compras?tab=aprovacoes&id=${purchaseId}`,
      read: false,
      email_sent: false,
    }));

    // Salvar notificações
    await base44.asServiceRole.entities.Notification.bulkCreate(notifications);

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // Enviar emails aos coordenadores
    for (const coord of coords) {
      if (coord.user_email !== ALLOWED_EMAIL) { console.log('Email bloqueado:', coord.user_email); continue; }
      try {
        await base44.integrations.Core.SendEmail({
          to: coord.user_email,
          subject: `Nova Solicitação de Compra - Aprovação Necessária`,
          body: `
            <h2>Nova Solicitação de Compra</h2>
            <p><strong>Descrição:</strong> ${purchaseData.descricao_item}</p>
            <p><strong>Valor:</strong> R$ ${(purchaseData.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><strong>Categoria:</strong> ${purchaseData.categoria || 'N/A'}</p>
            <p><strong>Fornecedor:</strong> ${purchaseData.fornecedor_nome || 'N/A'}</p>
            <hr />
            <p><a href="${process.env.APP_URL || 'https://base44.app'}/compras?tab=aprovacoes&id=${purchaseId}">Aprovar ou Reprovar</a></p>
          `,
          from_name: 'Sistema de Compras'
        });
      } catch (emailError) {
        console.error(`Erro ao enviar email para ${coord.user_email}:`, emailError.message);
      }
    }

    return Response.json({ 
      success: true, 
      notified: coords.length,
      message: `Notificações enviadas para ${coords.length} coordenador(es)`
    });
  } catch (error) {
    console.error('Erro em notifyPurchaseForApproval:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});