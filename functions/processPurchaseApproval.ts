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
      action, // 'approve_coord' | 'reject'
      comentario = ''
    } = await req.json();

    if (!purchaseId || !action) {
      return Response.json(
        { error: 'purchaseId e action são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['approve_coord', 'reject'].includes(action)) {
      return Response.json(
        { error: 'Ação inválida. Use approve_coord ou reject.' },
        { status: 400 }
      );
    }

    const isCoordenador = [
      'admin',
      'ADMIN',
      'COORDENADOR',
      'COORD_COMUNICACAO',
      'COORD_ADMINISTRATIVA',
      'COORD_PRODUCAO'
    ].includes(user.role);

    if (!isCoordenador) {
      return Response.json(
        { error: 'Usuário sem permissão para aprovar ou recusar compras.' },
        { status: 403 }
      );
    }

    // Buscar compra
    let p;
    try {
      p = await base44.entities.PurchaseRequest.get(purchaseId);
    } catch {
      p = null;
    }

    if (!p) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    // Só permite agir sobre solicitações pendentes
    if (p.status !== 'SOLICITADO') {
      return Response.json(
        { error: `A compra está com status "${p.status}" e não pode ser processada nesta etapa.` },
        { status: 400 }
      );
    }

    const nomeAtor = user.full_name || user.email || 'Usuário';
    const emailAtor = user.email || '';
    const dataAprovacao = new Date().toISOString().split('T')[0];

    let novoStatus = p.status;

    if (action === 'approve_coord') {
      const valorFinal = parseFloat(p.valor_solicitado || 0);

      if (valorFinal <= 0) {
        return Response.json(
          { error: 'Valor da compra inválido para aprovação.' },
          { status: 400 }
        );
      }

      if (!p.budgetline_id) {
        return Response.json(
          { error: 'A compra não possui rubrica/linha orçamentária vinculada.' },
          { status: 400 }
        );
      }

      // Validar saldo antes de comprometer
      let budgetLine;
      try {
        budgetLine = await base44.entities.BudgetLine.get(p.budgetline_id);
      } catch {
        budgetLine = null;
      }

      if (!budgetLine) {
        return Response.json(
          { error: 'Rubrica/linha orçamentária não encontrada.' },
          { status: 404 }
        );
      }

      const saldoDisponivel =
        (budgetLine.saldo_inicial || 0) - (budgetLine.saldo_comprometido || 0);

      if (saldoDisponivel < valorFinal) {
        return Response.json(
          {
            error: `Saldo insuficiente para aprovação. Disponível: R$ ${saldoDisponivel.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}`
          },
          { status: 400 }
        );
      }

      novoStatus = 'APROVADO_COORD';

      // Atualizar compra
      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprov_coord_nome: nomeAtor,
        aprov_coord_email: emailAtor,
        aprov_coord_data: dataAprovacao,
        aprov_coord_comentario: comentario,
      });

      // Comprometer saldo
      const novoComprometido =
        (budgetLine.saldo_comprometido || 0) + valorFinal;

      await base44.entities.BudgetLine.update(p.budgetline_id, {
        saldo_comprometido: novoComprometido,
      });

      // Notificar solicitante via email
      try {
        await base44.asServiceRole.functions.invoke('notifyUserOnPurchaseStatusChange', {
          purchaseId,
          newStatus: novoStatus,
          comentario
        });
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      // Notificação interna
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_email: p.created_by || emailAtor,
          type: 'REPORT_APPROVED',
          title: 'Sua Solicitação de Compra foi Aprovada',
          message: `Compra "${p.descricao_item}" foi aprovada pelo Coordenador. Valor: R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          read: false,
          email_sent: false,
        });
      } catch (e) {
        console.error('Erro ao criar notificação interna:', e.message);
      }
    }

    if (action === 'reject') {
      novoStatus = 'RECUSADO';

      await base44.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprov_coord_nome: nomeAtor,
        aprov_coord_email: emailAtor,
        aprov_coord_data: dataAprovacao,
        aprov_coord_comentario: comentario || 'Solicitação recusada',
      });

      // Notificar solicitante via email
      try {
        await base44.asServiceRole.functions.invoke('notifyUserOnPurchaseStatusChange', {
          purchaseId,
          newStatus: novoStatus,
          comentario
        });
      } catch (e) {
        console.error('Erro ao notificar mudança de status:', e.message);
      }

      // Notificação interna
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_email: p.created_by || emailAtor,
          type: 'REPORT_RETURNED',
          title: 'Sua Solicitação de Compra foi Recusada',
          message: `Compra "${p.descricao_item}" foi recusada.${comentario ? ` Motivo: ${comentario}` : ''}`,
          read: false,
          email_sent: false,
        });
      } catch (e) {
        console.error('Erro ao criar notificação interna:', e.message);
      }
    }

    return Response.json({
      success: true,
      status: novoStatus,
      message: action === 'approve_coord'
        ? 'Compra aprovada e saldo comprometido'
        : 'Compra recusada'
    });
  } catch (error) {
    console.error('Erro em processPurchaseApproval:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});