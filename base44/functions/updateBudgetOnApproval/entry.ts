import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * updateBudgetOnApproval
 *
 * Recalcula valor_utilizado e saldo de uma rubrica somando TODAS as
 * PurchaseRequests e TeamPayments com status APROVADO_ADMIN ou PAGO.
 *
 * Chamado via automação entity em PurchaseRequest (create/update)
 * ou diretamente com { rubricaId }.
 */

const STATUS_UTILIZADO = new Set(['APROVADO_ADMIN', 'PAGO']);

function toNum(v: any): number {
  return Number(v) || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { data, event } = body;

    // Suporta chamada direta com rubricaId, ou via payload de automação
    const rubricaId: string =
      body.rubricaId ||
      body.rubrica_id ||
      data?.rubrica_id ||
      data?.budgetline_id ||
      '';

    if (!rubricaId) {
      return Response.json({ success: true, skipped: true, reason: 'Sem rubrica_id no payload' });
    }

    // Busca a rubrica
    const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
    if (!rubrica) {
      return Response.json({ success: true, skipped: true, reason: `Rubrica ${rubricaId} não encontrada` });
    }

    // Soma PurchaseRequests aprovadas/pagas desta rubrica
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { rubrica_id: rubricaId }, '', 1000
    ).catch(() => []);

    const purchaseTotal = (purchases || [])
      .filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase()))
      .reduce((sum: number, p: any) => {
        const v = toNum(p.valor_pago) || toNum(p.valor_aprovado_admin) || toNum(p.valor_aprovado) || toNum(p.valor_solicitado);
        return sum + v;
      }, 0);

    // Soma TeamPayments aprovados/pagos desta rubrica
    const payments = await base44.asServiceRole.entities.TeamPayment.filter(
      { rubrica_id: rubricaId }, '', 500
    ).catch(() => []);

    const paymentTotal = (payments || [])
      .filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase()))
      .reduce((sum: number, p: any) => {
        const v = toNum(p.valor_nf) || toNum(p.valor_total) || toNum(p.valor_parcela_previsto) || toNum(p.valor);
        return sum + v;
      }, 0);

    const totalUtilizado = purchaseTotal + paymentTotal;
    const valorBase = toNum(rubrica.valor_rubrica) || toNum(rubrica.valor_total);
    const novoSaldo = valorBase - totalUtilizado;
    const percentual = valorBase > 0 ? Number(((totalUtilizado / valorBase) * 100).toFixed(2)) : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
      valor_utilizado: totalUtilizado,
      saldo: novoSaldo,
      saldo_real: novoSaldo,
      percentual_utilizado: percentual,
    });

    const purchasesAprovadas = (purchases || []).filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase())).length;
    const paymentsAprovados = (payments || []).filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase())).length;

    console.log(`[updateBudgetOnApproval] Rubrica ${rubricaId} (${rubrica.rubrica || rubrica.nome}): utilizado=R$${totalUtilizado.toFixed(2)}, saldo=R$${novoSaldo.toFixed(2)}, ${purchasesAprovadas} NFs + ${paymentsAprovados} pagamentos`);

    return Response.json({
      success: true,
      rubricaId,
      rubrica_nome: rubrica.rubrica || rubrica.nome,
      totalUtilizado,
      novoSaldo,
      percentual,
      purchases_aprovadas: purchasesAprovadas,
      payments_aprovados: paymentsAprovados,
    });

  } catch (error: any) {
    console.error('[updateBudgetOnApproval] Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});