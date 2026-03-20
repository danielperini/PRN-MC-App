import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildRubricaKey(rubrica) {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(
    rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || ''
  );
  return `${grupo}__${nome}`;
}

function getPurchaseValue(purchase) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
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

async function listAll(entityApi, orderBy = '', pageSize = 500) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;

    all = all.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return all;
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

function resolveRubricaFromPurchase(purchase, rubricas, budgetLineById) {
  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);
    if (rubrica) {
      return {
        rubricaId: rubrica.id,
        origem: 'rubrica_id',
        motivo: null,
      };
    }
  }

  const budgetlineId = getPurchaseBudgetlineId(purchase);

  if (budgetlineId) {
    const budgetLine = budgetLineById[budgetlineId];

    if (budgetLine?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);
      if (rubrica) {
        return {
          rubricaId: rubrica.id,
          origem: 'budgetline_id',
          motivo: null,
        };
      }
    }

    const nomeBudgetLine = normalizeString(
      budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || ''
    );

    if (nomeBudgetLine) {
      const matches = rubricas.filter((r) => {
        const nomeRubrica = normalizeString(
          r?.rubrica || r?.nome || r?.descricao || ''
        );
        const rubricaKey = buildRubricaKey(r);
        return (
          nomeRubrica === nomeBudgetLine ||
          rubricaKey.includes(nomeBudgetLine)
        );
      });

      if (matches.length === 1) {
        return {
          rubricaId: matches[0].id,
          origem: 'budgetline_nome',
          motivo: null,
        };
      }

      if (matches.length > 1) {
        return {
          rubricaId: null,
          origem: 'nao_encontrada',
          motivo: 'Match ambíguo via budget line',
        };
      }
    }
  }

  return {
    rubricaId: null,
    origem: 'nao_encontrada',
    motivo: 'Rubrica não resolvida',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let rubricaId = body.rubricaId || body.rubrica_id || null;
    let budgetlineId = body.budgetline_id || body.budgetlineId || null;
    let purchaseId = body.purchaseId || body.purchase_id || null;

    if (!rubricaId && body.data?.rubrica_id) {
      rubricaId = body.data.rubrica_id;
    }

    if (!rubricaId && body.event?.entity_id) {
      try {
        const lancamentos =
          await base44.asServiceRole.entities.LancamentoRubrica.filter({
            id: body.event.entity_id,
          });

        if (lancamentos && lancamentos.length > 0) {
          rubricaId = lancamentos[0].rubrica_id || rubricaId;
        }
      } catch (_e) {}
    }

    if (!budgetlineId && purchaseId) {
      try {
        const purchase =
          await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
        if (purchase) {
          budgetlineId = getPurchaseBudgetlineId(purchase);
          rubricaId = rubricaId || purchase.rubrica_id || null;
        }
      } catch (_e) {}
    }

    const allRubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    const rubricasMap = new Map();
    for (const r of allRubricas) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }
    const rubricasUnicas = Array.from(rubricasMap.values());

    let rubrica = null;

    if (rubricaId) {
      rubrica =
        rubricasUnicas.find((r) => r.id === rubricaId) ||
        (await findFirstRubricaByFilter(base44, { id: rubricaId }));
    }

    if (!rubrica && budgetlineId) {
      rubrica =
        (await findFirstRubricaByFilter(base44, { budgetline_id: budgetlineId })) ||
        (await findFirstRubricaByFilter(base44, { budget_line_id: budgetlineId })) ||
        (await findFirstRubricaByFilter(base44, { linha_orcamentaria_id: budgetlineId })) ||
        null;
    }

    if (!rubrica && purchaseId) {
      try {
        const purchase =
          await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

        const allBudgetLines = await listAll(
          base44.asServiceRole.entities.BudgetLine,
          'descricao',
          500
        );

        const budgetLineById = {};
        for (const bl of allBudgetLines) {
          if (bl?.id) budgetLineById[bl.id] = bl;
        }

        const resolved = resolveRubricaFromPurchase(
          purchase,
          rubricasUnicas,
          budgetLineById
        );

        if (resolved.rubricaId) {
          rubrica =
            rubricasUnicas.find((r) => r.id === resolved.rubricaId) || null;
        }
      } catch (_e) {}
    }

    if (!rubrica) {
      return Response.json(
        {
          error: 'Rubrica não encontrada',
          rubricaId,
          budgetlineId,
          purchaseId,
          success: false,
        },
        { status: 404 }
      );
    }

    const rubricaRealId = rubrica.id;

    budgetlineId =
      budgetlineId ||
      rubrica.budgetline_id ||
      rubrica.budget_line_id ||
      rubrica.linha_orcamentaria_id ||
      null;

    const allLancamentos = await getAllLancamentos(base44, rubricaRealId);

    const valorLancamentos = parseFloat(
      allLancamentos.reduce((sum, l) => sum + toNumber(l.valor), 0).toFixed(2)
    );

    const allBudgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'descricao',
      500
    );

    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    const purchases = await listAll(
      base44.asServiceRole.entities.PurchaseRequest,
      '-created_date',
      500
    );

    const uniquePurchases = [];
    const purchaseMap = {};
    const inconsistencias = [];

    for (const p of purchases) {
      const resolved = resolveRubricaFromPurchase(
        p,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        if (normalizeStatus(p.status) === 'PAGO') {
          inconsistencias.push({
            purchase_id: p.id,
            titulo: p.titulo || p.objeto || '',
            fornecedor: p.fornecedor || '',
            valor_pago: toNumber(p.valor_pago),
            status: p.status,
            rubrica_id: p.rubrica_id || null,
            budgetline_id: getPurchaseBudgetlineId(p),
            motivo: resolved.motivo,
          });
        }
        continue;
      }

      if (resolved.rubricaId !== rubricaRealId) continue;

      if (p && p.id && !purchaseMap[p.id]) {
        purchaseMap[p.id] = p;
        uniquePurchases.push(p);
      }
    }

    if (purchaseId && !purchaseMap[purchaseId]) {
      try {
        const purchaseDireta =
          await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

        if (purchaseDireta && purchaseDireta.id) {
          const resolved = resolveRubricaFromPurchase(
            purchaseDireta,
            rubricasUnicas,
            budgetLineById
          );

          if (resolved.rubricaId === rubricaRealId) {
            purchaseMap[purchaseDireta.id] = purchaseDireta;
            uniquePurchases.push(purchaseDireta);
          }
        }
      } catch (_e) {}
    }

    const paidPurchases = uniquePurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return status === 'PAGO' || status === 'PAGO_PARCIAL';
    });

    const approvedPurchases = uniquePurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD';
    });

    const valorComprasPagas = parseFloat(
      paidPurchases.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
    );

    const valorComprasComprometidas = parseFloat(
      approvedPurchases.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
    );

    const valorRubrica = toNumber(rubrica.valor_rubrica);

    const valorUtilizado = parseFloat(
      (valorComprasPagas + valorComprasComprometidas + valorLancamentos).toFixed(2)
    );

    const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
    const percentualUtilizado =
      valorRubrica > 0
        ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

    await base44.asServiceRole.entities.Rubrica.update(rubricaRealId, {
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
      rubrica_key: rubrica.rubrica_key || buildRubricaKey(rubrica),
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
      num_compras_aprovadas: approvedPurchases.length,
      valor_rubrica: valorRubrica,
      valor_lancamentos: valorLancamentos,
      valor_compras_pagas: valorComprasPagas,
      valor_compras_comprometidas: valorComprasComprometidas,
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
      fonte_utilizada: 'compras+lancamentos',
      inconsistencias,
    });
  } catch (error) {
    console.error('recalculateRubrica error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});