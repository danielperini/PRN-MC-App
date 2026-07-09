/**
 * conciliarPagamentosRubricas
 *
 * Percorre todas as Rubricas ativas e recalcula valor_utilizado / saldo
 * somando apenas PurchaseRequests e TeamPayments com status APROVADO_ADMIN ou PAGO.
 *
 * Pode ser chamado:
 *  - Manualmente (POST {}) para recalcular todas as rubricas
 *  - Via automação entity (PurchaseRequest ou TeamPayment) com payload { data, event }
 *    → nesse caso recalcula apenas a rubrica afetada
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function toNum(v: any): number {
  return Number(v) || 0;
}

// Apenas APROVADO_ADMIN e PAGO abatam o saldo — APROVADO_COORD não confirma gasto
const STATUS_UTILIZADO = new Set(['APROVADO_ADMIN', 'PAGO']);

async function recalcularRubrica(base44: any, rubricaId: string): Promise<any> {
  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
  if (!rubrica) return { skipped: true, reason: 'Rubrica não encontrada', rubricaId };

  // PurchaseRequests vinculadas
  const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter(
    { rubrica_id: rubricaId }, '', 1000
  ).catch(() => []);

  const purchaseTotal = (purchases || [])
    .filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase()))
    .reduce((sum: number, p: any) => {
      const v = toNum(p.valor_pago) || toNum(p.valor_aprovado_admin) || toNum(p.valor_aprovado) || toNum(p.valor_solicitado);
      return sum + v;
    }, 0);

  // TeamPayments vinculados
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
  const percentual = valorBase > 0 ? (totalUtilizado / valorBase) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
    valor_utilizado: totalUtilizado,
    saldo: novoSaldo,
    saldo_real: novoSaldo,
    percentual_utilizado: Number(percentual.toFixed(2)),
  });

  return {
    rubricaId,
    totalUtilizado,
    novoSaldo,
    percentual: Number(percentual.toFixed(2)),
    purchases_pagas: purchases.filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase())).length,
    payments_pagos: payments.filter((p: any) => STATUS_UTILIZADO.has(String(p.status || '').toUpperCase())).length,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { data, event } = body;

    // ── Modo automação entity: recalcula só a rubrica afetada ──────────────
    const rubricaIdDireto = body.rubricaId || body.rubrica_id || data?.rubrica_id;
    if (rubricaIdDireto) {
      const resultado = await recalcularRubrica(base44, rubricaIdDireto);
      console.log(`[conciliar] Rubrica ${rubricaIdDireto} recalculada`, resultado);
      return Response.json({ success: true, resultado });
    }

    // ── Modo manual: recalcula todas as rubricas ativas ────────────────────
    // Apenas admin pode disparar recálculo em lote
    if (user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem recalcular em lote' }, { status: 403 });
    }

    let skip = 0;
    const limit = 100;
    let total = 0;
    let atualizadas = 0;
    let erros = 0;
    const detalhes: any[] = [];

    while (true) {
      const lote = await base44.asServiceRole.entities.Rubrica.filter(
        { ativo: true }, '', limit, skip
      ).catch(() => []);

      if (!lote || lote.length === 0) break;
      total += lote.length;

      for (const rubrica of lote) {
        const res = await recalcularRubrica(base44, rubrica.id).catch((e: any) => ({
          rubricaId: rubrica.id,
          erro: e?.message,
        }));
        if ((res as any).erro) {
          erros++;
        } else {
          atualizadas++;
        }
        detalhes.push(res);
      }

      if (lote.length < limit) break;
      skip += limit;
    }

    console.log(`[conciliar] Lote concluído: ${atualizadas}/${total} rubricas atualizadas, ${erros} erros`);

    return Response.json({
      success: true,
      total,
      atualizadas,
      erros,
      detalhes,
    });

  } catch (error: any) {
    console.error('[conciliarPagamentosRubricas] Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});