import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, newStatus, comentario } = await req.json();

    if (!purchaseId || !newStatus) {
      return Response.json({ error: 'purchaseId e newStatus são obrigatórios' }, { status: 400 });
    }

    // Buscar a compra para obter dados do usuário e descrição
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchases || purchases.length === 0) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const purchase = purchases[0];
    const userEmail = purchase.created_by;
    const userName = purchase.created_by; // Usar email como fallback

    // Mapeamento de status para labels em português
    const statusMap = {
      'RASCUNHO': { label: 'Rascunho', emoji: '📝' },
      'ENVIADO_COORD': { label: 'Enviado para Coordenação', emoji: '📨' },
      'APROVADO_COORD': { label: 'Aprovado pela Coordenação ✅', emoji: '✅' },
      'RECUSADO': { label: 'Recusado ❌', emoji: '❌' },
      'PAGO': { label: 'Pago 💳', emoji: '💳' },
    };

    const statusInfo = statusMap[newStatus] || { label: newStatus, emoji: '📋' };

    let subject = `${statusInfo.emoji} Sua solicitação de compra: ${statusInfo.label}`;
    
    let body = `Olá,\n\n`;
    body += `Sua solicitação de compra foi atualizada:\n\n`;
    body += `📝 Item: ${purchase.descricao_item || 'Sem descrição'}\n`;
    body += `💰 Valor: R$ ${parseFloat(purchase.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    body += `📊 Novo Status: ${statusInfo.label}\n`;

    if (comentario) {
      body += `\n💬 Comentários do Coordenador:\n${comentario}\n`;
    }

    body += `\nAcesse a plataforma para mais detalhes sobre sua solicitação.\n\n`;
    body += `Plataforma Museus Centro`;

    await base44.integrations.Core.SendEmail({
      to: userEmail,
      subject,
      body,
    });

    return Response.json({ success: true, message: 'Notificação enviada ao usuário' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});