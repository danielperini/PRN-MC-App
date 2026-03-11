import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      purchaseId,
      action, // 'approve' | 'reject'
      comentario = '',
      valor_aprovado
    } = await req.json();

    if (!purchaseId || !action) {
      return Response.json({ error: 'purchaseId e action são obrigatórios' }, { status: 400 });
    }

    // Buscar compra
    const purchase = await base44.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchase || purchase.length === 0) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const p = purchase[0];

    // Determinar novo status
    let novoStatus = p.status;
    let nomeAtor = user.full_name;
    let emailAtor = user.email;
    let dataAprovacao = new Date().toISOString().split('T')[0];

    if (action === 'approve') {
      novoStatus = 'APROVADO';
      const valorFinal = valor_aprovado || p.valor_solicitado;

      // Atualizar dados de aprovação
      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprovado_por_nome: nomeAtor,
        aprovado_por_email: emailAtor,
        data_aprovacao: dataAprovacao,
        comentario_aprovacao: comentario,
        valor_aprovado: parseFloat(valorFinal),
      });

      // Atualizar saldo da rubrica
      if (p.budgetline_id) {
        const budgetLine = await base44.entities.BudgetLine.filter({ id: p.budgetline_id });
        if (budgetLine && budgetLine.length > 0) {
          const bl = budgetLine[0];
          const novoComprometido = (bl.saldo_comprometido || 0) + parseFloat(valorFinal);
          await base44.entities.BudgetLine.update(p.budgetline_id, {
            saldo_comprometido: novoComprometido,
          });
        }
      }

      // Notificar solicitante via função dedicada
      try {
        await base44.asServiceRole.functions.invoke('notifyPurchaseStatusChange', {
          purchaseId: purchaseId,
          newStatus: novoStatus,
          comentario: comentario
        });
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      // Notificar solicitante que foi aprovado
      const notificacao = {
        user_email: p.created_by || emailAtor,
        type: 'REPORT_APPROVED',
        title: 'Sua Solicitação de Compra foi Aprovada',
        message: `Compra "${p.descricao_item}" foi aprovada por ${nomeAtor}. Valor aprovado: R$ ${parseFloat(valorFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        read: false,
        email_sent: false,
      };

      await base44.asServiceRole.entities.Notification.create(notificacao);

    } else if (action === 'reject') {
      novoStatus = 'RECUSADO';

      // Salvar motivo no campo correto conforme o estágio de aprovação
      const isAdminStage = p.status === 'APROVADO_COORD';
      const rejectUpdate = { status: novoStatus };
      if (isAdminStage) {
        rejectUpdate.aprov_admin_nome = nomeAtor;
        rejectUpdate.aprov_admin_data = dataAprovacao;
        rejectUpdate.aprov_admin_comentario = comentario || 'Solicitação recusada';
      } else {
        rejectUpdate.aprov_coord_nome = nomeAtor;
        rejectUpdate.aprov_coord_data = dataAprovacao;
        rejectUpdate.aprov_coord_comentario = comentario || 'Solicitação recusada';
      }

      await base44.entities.PurchaseRequest.update(purchaseId, rejectUpdate);

      // Notificar solicitante via função dedicada
      try {
        await base44.asServiceRole.functions.invoke('notifyPurchaseStatusChange', {
          purchaseId: purchaseId,
          newStatus: novoStatus,
          comentario: comentario
        });
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      // Notificar solicitante que foi recusado
      const notificacao = {
        user_email: p.created_by || emailAtor,
        type: 'REPORT_RETURNED',
        title: 'Sua Solicitação de Compra foi Recusada',
        message: `Compra "${p.descricao_item}" foi recusada. ${comentario ? `Motivo: ${comentario}` : ''}`,
        read: false,
        email_sent: false,
      };

      await base44.asServiceRole.entities.Notification.create(notificacao);
    }

    return Response.json({ 
      success: true, 
      status: novoStatus,
      message: `Compra ${action === 'approve_coord' ? 'aprovada pelo coordenador' : action === 'approve_admin' ? 'aprovada administrativamente' : 'recusada'}`
    });
  } catch (error) {
    console.error('Erro em processPurchaseApproval:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});