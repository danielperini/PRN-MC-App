import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function status(v: any) {
  return String(v || '').toUpperCase();
}

function valorPurchase(p: any) {
  return toNumber(p.valor_pago) || toNumber(p.valor_aprovado) || toNumber(p.valor_total) || toNumber(p.valor_solicitado) || toNumber(p.valor);
}

function valorTeamPayment(p: any) {
  return toNumber(p.valor_pago) || toNumber(p.valor_nf) || toNumber(p.valor_total) || toNumber(p.valor);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('', 3000);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 3000);
    const payments = await base44.asServiceRole.entities.TeamPayment.list('-created_date', 3000);

    for (const rubrica of rubricas || []) {
      const rubricaId = rubrica.id;

      let valor_utilizado = 0;
      let saldo_comprometido = 0;

      for (const p of purchases || []) {
        if (p.rubrica_id !== rubricaId) continue;

        const s = status(p.status);
        const valor = valorPurchase(p);

        if (['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO'].includes(s)) {
          valor_utilizado += valor;
        }

        if (['SOLICITADO', 'EM_ANALISE'].includes(s)) {
          saldo_comprometido += 0;
        }
      }

      for (const p of payments || []) {
        if (p.rubrica_id !== rubricaId) continue;

        const s = status(p.status);
        const valor = valorTeamPayment(p);

        if (['APROVADO_COORD', 'APROVADO', 'PAGO'].includes(s)) {
          valor_utilizado += valor;
        }

        if (['AGUARDANDO_APROVACAO', 'EM_ANALISE'].includes(s)) {
          saldo_comprometido += 0;
        }
      }

      const valor_total = toNumber(rubrica.valor_rubrica) || toNumber(rubrica.valor_total);
      const saldo = valor_total - valor_utilizado - saldo_comprometido;
      const percentual_utilizado = valor_total > 0 ? Number(((valor_utilizado / valor_total) * 100).toFixed(2)) : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado,
        saldo_comprometido,
        saldo,
        percentual_utilizado,
        recalculado_em: new Date().toISOString(),
      });
    }

    return Response.json({
      success: true,
      rubricas_processadas: (rubricas || []).length,
    });
  } catch (e: any) {
    return Response.json({
      success: false,
      error: e?.message || 'Erro interno ao recalcular rubricas',
    }, { status: 500 });
  }
});
