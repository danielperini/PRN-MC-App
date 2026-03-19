import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

async function findFirstRubricaByFilter(base44, filterObj) {
  try {
    const result = await base44.asServiceRole.entities.Rubrica.filter(filterObj);
    return result && result.length > 0 ? result[0] : null;
  } catch (_e) {
    return null;
  }
}

async function getAllLancamentos(base44, rubricaId) {
  const pageSize = 500;
  let allLancamentos = [];
  let page = 0;

  while (true) {
    const batch = await base44.asServiceRole.entities.LancamentoRubrica.filter(
      { rubrica_id: rubricaId },
      '-created_date',
      pageSize,
      page * pageSize
    );

    if (!batch || batch.length === 0) break;

    allLancamentos = allLancamentos.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return allLancamentos;
}

async function getAllPurchasesByFilter(base44, filterObj) {
  const pageSize = 500;
  let allPurchases = [];
  let page = 0;

  while (true) {
    const batch = await base44.asServiceRole.entities.PurchaseRequest.filter(
      filterObj,
      '-created_date',
      pageSize,
      page * pageSize
    );

    if (!batch || batch.length === 0) break;

    allPurchases = allPurchases.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return allPurchases;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let rubricaId = body.rubricaId || body.rubrica_id || null;
    let budgetlineId = body.budgetline_id || body.budgetlineId || null;
    let purchaseId = body.purchaseId || body.purchase_id || null;

    // Payload vindo de automação de entidade
    if (!rubricaId && body.data?.rubrica_id) {
      rubricaId = body.data.rubrica_id;
    }

    // Evento vindo de LancamentoRubrica
    if (!rubricaId && body.event?.entity_id) {
      try {
        const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.filter({
          id: body.event.entity_id
        });

        if (lancamentos && lancamentos.length > 0) {
          rubricaId = lancamentos[0].rubrica_id || rubricaId;
        }
      } catch (_e) {}
    }

    // Se veio purchaseId, tenta descobrir budgetline_id pela compra
    if (!budgetlineId && purchaseId) {
      try {
        const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
        if (purchase) {
          budgetlineId = purchase.budgetline_id || purchase.budget_line_id || budgetlineId;
        }
      } catch (_e) {}
    }

    let rubrica = null;

    // 1) Busca direta por ID da rubrica
    if (rubricaId) {
      rubrica = await findFirstRubricaByFilter(base44, { id: rubricaId });
    }

    // 2) Tenta achar rubrica ligada à budgetline
    if (!rubrica && budgetlineId) {
      rubrica =
        await findFirstRubricaByFilter(base44, { budgetline_id: budgetlineId }) ||
        await findFirstRubricaByFilter(base44, { budget_line_id: budgetlineId }) ||
        await findFirstRubricaByFilter(base44, { linha_orcamentaria_id: budgetlineId }) ||
        await findFirstRubricaByFilter(base44, { id: budgetlineId });
    }

    if (!rubrica) {
      return Response.json(
        {
          error: 'Rubrica não encontrada',
          rubricaId,
          budgetlineId,
          purchaseId,
          success: false
        },
        { status: 404 }
      );
    }

    const rubricaRealId = rubrica.id;

    // Se não veio budgetlineId no payload, tenta reaproveitar da própria rubrica
    budgetlineId =
      budgetlineId ||
      rubrica.budgetline_id ||
      rubrica.budget_line_id ||
      rubrica.linha_orcamentaria_id ||
      null;

    // Buscar todos os lançamentos da rubrica
    const allLancamentos = await getAllLancamentos(base44, rubricaRealId);

    // Soma total dos lançamentos
    const valorLancamentos = parseFloat(
      allLancamentos.reduce((sum, l) => sum + toNumber(l.valor), 0).toFixed(2)
    );

    // Buscar compras relacionadas
    let purchases = [];

    if (budgetlineId) {
      const byBudgetLine = await getAllPurchasesByFilter(base44, {
        budgetline_id: budgetlineId
      });
      purchases = purchases.concat(byBudgetLine);

      try {
        const byBudgetLineAlt = await getAllPurchasesByFilter(base44, {
          budget_line_id: budgetlineId
        });
        purchases = purchases.concat(byBudgetLineAlt);
      } catch (_e) {}
    }

    // Tenta também por rubrica_id, se existir essa modelagem
    try {
      const byRubrica = await getAllPurchasesByFilter(base44, {
        rubrica_id: rubricaRealId
      });
      purchases = purchases.concat(byRubrica);
    } catch (_e) {}

    // Se veio purchaseId específico e ainda não apareceu na lista, tenta puxar direto
    if (purchaseId) {
      try {
        const purchaseDireta = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
        if (purchaseDireta && purchaseDireta.id) {
          purchases.push(purchaseDireta);
        }
      } catch (_e) {}
    }

    // Remove duplicados por id
    const purchaseMap = {};
    for (const p of purchases) {
      if (p && p.id) {
        purchaseMap[p.id] = p;
      }
    }
    const uniquePurchases = Object.values(purchaseMap);

    // Considera só compras efetivamente pagas
    const paidPurchases = uniquePurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return status === 'PAGO' || status === 'PAGO_PARCIAL';
    });

    const valorComprasPagas = parseFloat(
      paidPurchases.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
    );

    const valorRubrica = toNumber(rubrica.valor_rubrica);

    // Regra:
    // - se houver compras pagas vinculadas, elas são a fonte de verdade
    // - se não houver compras pagas, usa a soma dos lançamentos
    const valorUtilizadoBase =
      valorComprasPagas > 0 ? valorComprasPagas : valorLancamentos;

    const valorUtilizado = parseFloat(toNumber(valorUtilizadoBase).toFixed(2));
    const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
    const percentualUtilizado =
      valorRubrica > 0
        ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaRealId, {
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado
    });

    return Response.json({
      success: true,
      rubrica_id: rubricaRealId,
      rubrica: rubrica.rubrica || rubrica.nome || null,
      budgetline_id: budgetlineId || null,
      purchase_id: purchaseId || null,
      num_lancamentos: allLancamentos.length,
      num_compras_encontradas: uniquePurchases.length,
      num_compras_pagas: paidPurchases.length,
      valor_rubrica: valorRubrica,
      valor_lancamentos: valorLancamentos,
      valor_compras_pagas: valorComprasPagas,
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
      fonte_utilizada: valorComprasPagas > 0 ? 'compras_pagas' : 'lancamentos'
    });
  } catch (error) {
    console.error('recalculateRubrica error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});