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
      action, // 'approve_coord' | 'approve_admin' | 'reject'
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

    if (action === 'approve_coord') {
      novoStatus = 'APROVADO_COORD';
      // Atualizar dados de aprovação coord
      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprov_coord_nome: nomeAtor,
        aprov_coord_data: dataAprovacao,
        aprov_coord_comentario: comentario,
      });

      // Notificar admin
      const admins = await base44.asServiceRole.entities.UserPermission.filter({
        base_role: 'ADMIN'
      });

      const notificacoes = admins.map(admin => ({
        user_email: admin.user_email,
        type: 'PURCHASE_COORD_APPROVED',
        title: 'Solicitação Aprovada pelo Coordenador',
        message: `Compra "${p.descricao_item}" foi aprovada pelo coordenador. Aguarda aprovação administrativa.`,
        purchase_id: purchaseId,
        action_url: `/compras?tab=aprovacoes&id=${purchaseId}`,
        read: false,
        email_sent: false,
      }));

      await base44.asServiceRole.entities.Notification.bulkCreate(notificacoes);

    } else if (action === 'approve_admin') {
      novoStatus = 'APROVADO_ADMIN';
      const valorFinal = valor_aprovado || p.valor_solicitado;

      // Atualizar dados de aprovação admin
      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprov_admin_nome: nomeAtor,
        aprov_admin_data: dataAprovacao,
        aprov_admin_comentario: comentario,
        valor_aprovado_admin: parseFloat(valorFinal),
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

      // Notificar solicitante que foi aprovado
      const notificacao = {
        user_email: p.created_by || emailAtor,
        type: 'PURCHASE_APPROVED',
        title: 'Sua Solicitação de Compra foi Aprovada',
        message: `Compra "${p.descricao_item}" foi aprovada por ${nomeAtor}. Valor aprovado: R$ ${parseFloat(valorFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        purchase_id: purchaseId,
        action_url: `/compras?id=${purchaseId}`,
        read: false,
        email_sent: false,
      };

      await base44.asServiceRole.entities.Notification.create(notificacao);

      // Enviar email de aprovação
      try {
        await base44.integrations.Core.SendEmail({
          to: p.created_by || emailAtor,
          subject: 'Solicitação de Compra Aprovada',
          body: `
            <h2>✅ Solicitação Aprovada</h2>
            <p><strong>Descrição:</strong> ${p.descricao_item}</p>
            <p><strong>Valor Aprovado:</strong> R$ ${parseFloat(valorFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><strong>Aprovado por:</strong> ${nomeAtor}</p>
            ${comentario ? `<p><strong>Comentário:</strong> ${comentario}</p>` : ''}
          `,
          from_name: 'Sistema de Compras'
        });
      } catch (emailError) {
        console.error('Erro ao enviar email:', emailError.message);
      }

    } else if (action === 'reject') {
      novoStatus = 'RECUSADO';

      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        observacoes: comentario || 'Solicitação recusada',
      });

      // Notificar solicitante que foi recusado
      const notificacao = {
        user_email: p.created_by || emailAtor,
        type: 'PURCHASE_REJECTED',
        title: 'Sua Solicitação de Compra foi Recusada',
        message: `Compra "${p.descricao_item}" foi recusada. ${comentario ? `Motivo: ${comentario}` : ''}`,
        purchase_id: purchaseId,
        action_url: `/compras?id=${purchaseId}`,
        read: false,
        email_sent: false,
      };

      await base44.asServiceRole.entities.Notification.create(notificacao);

      // Enviar email de rejeição
      try {
        await base44.integrations.Core.SendEmail({
          to: p.created_by || emailAtor,
          subject: 'Solicitação de Compra Recusada',
          body: `
            <h2>❌ Solicitação Recusada</h2>
            <p><strong>Descrição:</strong> ${p.descricao_item}</p>
            <p><strong>Valor Solicitado:</strong> R$ ${(p.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><strong>Recusado por:</strong> ${nomeAtor}</p>
            ${comentario ? `<p><strong>Motivo:</strong> ${comentario}</p>` : ''}
            <hr />
            <p>Entre em contato com o coordenador para mais informações.</p>
          `,
          from_name: 'Sistema de Compras'
        });
      } catch (emailError) {
        console.error('Erro ao enviar email:', emailError.message);
      }
    }

    // Limpar notificações antigas desta compra
    const notificacoesAntigas = await base44.asServiceRole.entities.Notification.filter({
      purchase_id: purchaseId
    });
    for (const notif of notificacoesAntigas) {
      if (notif.type.includes('AWAITING')) {
        await base44.asServiceRole.entities.Notification.delete(notif.id);
      }
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