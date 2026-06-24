import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Recalcula valor_utilizado e saldo de uma rubrica somando TODAS as
 * PurchaseRequests e TeamPayments aprovados/pagos vinculados a ela.
 *
 * Disparado por automação entity em PurchaseRequest (create/update).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { data, event } = body;

    // Suporte a chamada direta com rubricaId
    const rubricaIdDireto = body.rubricaId || body.rubrica_id;

    // Status que contam como "utilizado"
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO']);

    // Se chamado por automação entity, extrai rubrica do registro
    let rubricaId = rubricaIdDireto;
    if (!rubricaId && data) {
      rubricaId = data.rubrica_id || data.budgetline_id;
    }

    if (!rubricaId) {
      return Response.json({ success: true, skipped: true, reason: 'Sem rubrica_id no payload' });
    }

    // Sempre recalcula quando há rubrica_id — tanto aprovações quanto estornos (cancelar/devolver)

    // Busca a rubrica
    const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
    if (!rubrica) {
      return Response.json({ success: true, skipped: true, reason: 'Rubrica não encontrada' });
    }

    // Soma todas as PurchaseRequests aprovadas/pagas desta rubrica
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({
      rubrica_id: rubricaId,
    }, '', 1000);

    const purchaseTotal = (purchases || [])
      .filter((p) => STATUS_APROVADOS.has(p.status))
      .reduce((sum, p) => {
        const v = p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || p.valor_total || p.valor || 0;
        return sum + (Number(v) || 0);
      }, 0);

    // Soma TeamPayments aprovados/pagos desta rubrica
    const payments = await base44.asServiceRole.entities.TeamPayment.filter({
      rubrica_id: rubricaId,
    }, '', 500).catch(() => []);

    const paymentTotal = (payments || [])
      .filter((p) => STATUS_APROVADOS.has(p.status))
      .reduce((sum, p) => sum + (Number(p.valor_total || p.valor || 0)), 0);

    const totalUtilizado = purchaseTotal + paymentTotal;

    const valorBase = Number(rubrica.valor_rubrica || rubrica.valor_total || 0);
    const novoSaldo = valorBase - totalUtilizado;
    const percentual = valorBase > 0 ? (totalUtilizado / valorBase) * 100 : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado: totalUtilizado,
      saldo: novoSaldo,
      saldo_real: novoSaldo,
      percentual_utilizado: percentual,
    });

    console.log(`Rubrica ${rubricaId} atualizada: utilizado=${totalUtilizado.toFixed(2)}, saldo=${novoSaldo.toFixed(2)}`);

    return Response.json({
      success: true,
      rubricaId,
      totalUtilizado,
      novoSaldo,
      percentual,
      purchases: purchases?.filter(p => STATUS_APROVADOS.has(p.status)).length,
    });
  } catch (error) {
    console.error('Erro em updateBudgetOnApproval:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});