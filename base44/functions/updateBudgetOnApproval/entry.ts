import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data } = body;

    // Verifica se é uma aprovação (status mudou para APROVADO ou PAGO)
    const isApprovalOrPayment = data?.status === 'APROVADO' || data?.status === 'PAGO';

    if (!isApprovalOrPayment) {
      return Response.json({ success: true, skipped: true });
    }

    // Identifica a rubrica relacionada
    let rubricaId = null;

    if (event.entity_name === 'PurchaseRequest') {
      rubricaId = data?.rubrica_id || data?.budgetline_id;
    } else if (event.entity_name === 'TeamPayment') {
      rubricaId = data?.budgetline_id || data?.rubrica_id;
    }

    if (!rubricaId) {
      return Response.json({ success: true, skipped: true, reason: 'No rubrica found' });
    }

    // Busca a rubrica
    const rubrica = await base44.asServiceRole.entities.Rubrica.read(rubricaId);
    if (!rubrica) {
      return Response.json({ success: true, skipped: true });
    }

    // Recalcula os valores utilizados aprovados
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({
      rubrica_id: rubricaId,
      status: { $in: ['APROVADO', 'PAGO'] }
    });

    const payments = await base44.asServiceRole.entities.TeamPayment.filter({
      budgetline_id: rubricaId,
      status: { $in: ['APROVADO', 'PAGO'] }
    });

    // Soma os totais aprovados
    const purchaseTotal = purchases.reduce((sum, p) => sum + (p.valor_total || 0), 0);
    const paymentTotal = payments.reduce((sum, p) => sum + (p.valor_total || 0), 0);
    const totalUtilizadoAprovado = purchaseTotal + paymentTotal;

    // Calcula saldo
    const saldoDisponivel = rubrica.valor_total - totalUtilizadoAprovado;

    // Atualiza a rubrica
    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado_aprovado: totalUtilizadoAprovado,
      saldo_disponivel: saldoDisponivel,
      last_budget_update: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      rubricaId,
      totalUtilizadoAprovado,
      saldoDisponivel,
    });
  } catch (error) {
    console.error('Error in updateBudgetOnApproval:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});