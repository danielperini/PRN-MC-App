import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getPurchaseBudgetlineId(purchase) {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
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

function resolveRubricaFromPurchase(purchase, rubricas, budgetLineById) {
  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);
    if (rubrica) {
      return {
        rubricaId: rubrica.id,
        origem: 'rubrica_id',
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
        };
      }
    }

    const nomeBudget = normalizeText(
      budgetLine?.descricao || budgetLine?.nome || ''
    );

    const match = rubricas.find((r) =>
      normalizeText(r.rubrica).includes(nomeBudget)
    );

    if (match) {
      return {
        rubricaId: match.id,
        origem: 'match_nome',
      };
    }
  }

  return { rubricaId: null, origem: 'nao_encontrada' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [rubricas, purchases, budgetLines] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'codigo', 500),
    ]);

    const budgetLineById = {};
    for (const bl of budgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const diagnostico = [];

    for (const compra of purchases) {
      const status = normalizeStatus(compra.status);

      const resolved = resolveRubricaFromPurchase(
        compra,
        rubricas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        diagnostico.push({
          purchase_id: compra.id,
          descricao: compra.descricao_item || compra.titulo || '',
          fornecedor: compra.fornecedor_nome || '',
          status,
          valor: getPurchaseValue(compra),
          rubrica_id: compra.rubrica_id || null,
          budgetline_id: getPurchaseBudgetlineId(compra),
          problema: 'SEM_RUBRICA',
          origem: resolved.origem,
        });
      }
    }

    const totalPagasSemRubrica = diagnostico.filter(
      (d) => d.status === 'PAGO'
    ).length;

    const totalAprovadasSemRubrica = diagnostico.filter((d) => {
      return d.status === 'APROVADO_ADMIN' || d.status === 'APROVADO_COORD';
    }).length;

    return Response.json({
      success: true,
      total_compras: purchases.length,
      total_rubricas: rubricas.length,
      total_budgetlines: budgetLines.length,
      total_problemas: diagnostico.length,
      total_pagas_sem_rubrica: totalPagasSemRubrica,
      total_aprovadas_sem_rubrica: totalAprovadasSemRubrica,
      diagnostico,
    });
  } catch (error) {
    console.error('diagnosticarRubricas error:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});
