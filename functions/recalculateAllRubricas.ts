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
  return String(value || '').trim().toLowerCase();
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

async function listAll(entityApi, orderBy, pageSize = 500) {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Buscar todas as rubricas com paginação
    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    // Buscar TODOS os lançamentos
    const allLancamentos = await listAll(
      base44.asServiceRole.entities.LancamentoRubrica,
      '-created_date',
      500
    );

    // Buscar TODAS as compras
    const allPurchases = await listAll(
      base44.asServiceRole.entities.PurchaseRequest,
      '-created_date',
      500
    );

    // Buscar TODAS as budget lines
    const allBudgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'descricao',
      500
    );

    // Indexar BudgetLine por id
    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl && bl.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    // Indexar lançamentos por rubrica_id
    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      const key = l && l.rubrica_id ? l.rubrica_id : null;
      if (!key) continue;

      if (!lancamentosPorRubrica[key]) {
        lancamentosPorRubrica[key] = [];
      }

      lancamentosPorRubrica[key].push(l);
    }

    // Indexar compras por budgetline_id
    const comprasPorBudgetLine = {};
    for (const p of allPurchases) {
      const key = p && p.budgetline_id ? p.budgetline_id : null;
      if (!key) continue;

      if (!comprasPorBudgetLine[key]) {
        comprasPorBudgetLine[key] = [];
      }

      comprasPorBudgetLine[key].push(p);
    }

    // Indexar compras por budget_line_id
    const comprasPorBudgetLineAlt = {};
    for (const p of allPurchases) {
      const key = p && p.budget_line_id ? p.budget_line_id : null;
      if (!key) continue;

      if (!comprasPorBudgetLineAlt[key]) {
        comprasPorBudgetLineAlt[key] = [];
      }

      comprasPorBudgetLineAlt[key].push(p);
    }

    // Indexar compras por linha_orcamentaria_id
    const comprasPorLinhaOrc = {};
    for (const p of allPurchases) {
      const key = p && p.linha_orcamentaria_id ? p.linha_orcamentaria_id : null;
      if (!key) continue;

      if (!comprasPorLinhaOrc[key]) {
        comprasPorLinhaOrc[key] = [];
      }

      comprasPorLinhaOrc[key].push(p);
    }

    // Indexar compras por rubrica_id
    const comprasPorRubrica = {};
    for (const p of allPurchases) {
      const key = p && p.rubrica_id ? p.rubrica_id : null;
      if (!key) continue;

      if (!comprasPorRubrica[key]) {
        comprasPorRubrica[key] = [];
      }

      comprasPorRubrica[key].push(p);
    }

    // Indexar compras por nome da budget line
    const comprasPorNomeBudgetLine = {};
    for (const p of allPurchases) {
      const purchaseBudgetLineId =
        p?.budgetline_id || p?.budget_line_id || p?.linha_orcamentaria_id || null;

      if (!purchaseBudgetLineId) continue;

      const budgetLine = budgetLineById[purchaseBudgetLineId];
      const nomeBudgetLine = normalizeString(
        budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || ''
      );

      if (!nomeBudgetLine) continue;

      if (!comprasPorNomeBudgetLine[nomeBudgetLine]) {
        comprasPorNomeBudgetLine[nomeBudgetLine] = [];
      }

      comprasPorNomeBudgetLine[nomeBudgetLine].push(p);
    }

    const results = [];

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const budgetlineId =
        rubrica.budgetline_id ||
        rubrica.budget_line_id ||
        rubrica.linha_orcamentaria_id ||
        null;

      const nomeRubrica = normalizeString(
        rubrica.rubrica || rubrica.nome || rubrica.descricao || ''
      );

      const lans = lancamentosPorRubrica[rubricaId] || [];

      const valorLancamentos = parseFloat(
        lans.reduce((sum, l) => sum + toNumber(l.valor), 0).toFixed(2)
      );

      const comprasLigadas = [
        ...(rubrica.budgetline_id ? (comprasPorBudgetLine[rubrica.budgetline_id] || []) : []),
        ...(rubrica.budget_line_id ? (comprasPorBudgetLineAlt[rubrica.budget_line_id] || []) : []),
        ...(rubrica.linha_orcamentaria_id ? (comprasPorLinhaOrc[rubrica.linha_orcamentaria_id] || []) : []),
        ...(budgetlineId ? (comprasPorBudgetLine[budgetlineId] || []) : []),
        ...(budgetlineId ? (comprasPorBudgetLineAlt[budgetlineId] || []) : []),
        ...(budgetlineId ? (comprasPorLinhaOrc[budgetlineId] || []) : []),
        ...(comprasPorRubrica[rubricaId] || []),
        ...(nomeRubrica ? (comprasPorNomeBudgetLine[nomeRubrica] || []) : [])
      ];

      // Remover duplicidade
      const mapaCompras = {};
      for (const compra of comprasLigadas) {
        if (compra && compra.id) {
          mapaCompras[compra.id] = compra;
        }
      }

      const comprasUnicas = Object.values(mapaCompras);

      const comprasPagas = comprasUnicas.filter((p) => {
        const status = normalizeStatus(p.status);
        return status === 'PAGO' || status === 'PAGO_PARCIAL';
      });

      const valorComprasPagas = parseFloat(
        comprasPagas.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorRubrica = toNumber(rubrica.valor_rubrica);

      // Regra principal:
      // se houver compras pagas vinculadas, elas mandam no valor_utilizado
      // senão, usa lançamentos
      const valorUtilizadoBase =
        valorComprasPagas > 0 ? valorComprasPagas : valorLancamentos;

      const valorUtilizado = parseFloat(toNumber(valorUtilizadoBase).toFixed(2));
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: valorUtilizado,
        saldo: saldo,
        percentual_utilizado: percentualUtilizado
      });

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        budgetline_id: budgetlineId,
        nome_rubrica_normalizado: nomeRubrica,
        num_lancamentos: lans.length,
        num_compras_encontradas: comprasUnicas.length,
        num_compras_pagas: comprasPagas.length,
        valor_rubrica: valorRubrica,
        valor_lancamentos: valorLancamentos,
        valor_compras_pagas: valorComprasPagas,
        valor_utilizado: valorUtilizado,
        saldo: saldo,
        percentual_utilizado: percentualUtilizado,
        fonte_utilizada: valorComprasPagas > 0 ? 'compras_pagas' : 'lancamentos'
      });
    }

    const sumario = {
      total_rubricas: results.length,
      total_lancamentos: allLancamentos.length,
      total_compras: allPurchases.length,
      valor_total_orcado: parseFloat(
        results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2)
      ),
      valor_total_utilizado: parseFloat(
        results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2)
      ),
      valor_total_saldo: parseFloat(
        results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2)
      )
    };

    return Response.json({
      success: true,
      trigger: body && body.trigger ? body.trigger : null,
      sumario,
      results
    });
  } catch (error) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});