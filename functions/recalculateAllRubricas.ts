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

async function filterAll(entityApi, filterObj, orderBy = '-created_date', pageSize = 500) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.filter(filterObj, orderBy, pageSize, page * pageSize);
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

    // Buscar todas as rubricas
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);

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

    // Indexar lançamentos por rubrica_id
    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      const key = l?.rubrica_id;
      if (!key) continue;
      if (!lancamentosPorRubrica[key]) {
        lancamentosPorRubrica[key] = [];
      }
      lancamentosPorRubrica[key].push(l);
    }

    // Indexar compras por budgetline_id
    const comprasPorBudgetLine = {};
    for (const p of allPurchases) {
      const key = p?.budgetline_id;
      if (!key) continue;
      if (!comprasPorBudgetLine[key]) {
        comprasPorBudgetLine[key] = [];
      }
      comprasPorBudgetLine[key].push(p);
    }

    // Indexar compras por rubrica_id, se existir essa modelagem
    const comprasPorRubrica = {};
    for (const p of allPurchases) {
      const key = p?.rubrica_id;
      if (!key) continue;
      if (!comprasPorRubrica[key]) {
        comprasPorRubrica[key] = [];
      }
      comprasPorRubrica[key].push(p);
    }

    const results = [];

    for (const rubrica of rubricas) {
      const lans = lancamentosPorRubrica[rubrica.id] || [];

      const valorLancamentos = parseFloat(
        lans.reduce((sum, l) => sum + toNumber(l.valor), 0).toFixed(2)
      );

      // compras ligadas à rubrica por budgetline_id ou rubrica_id
      const comprasLigadas = [
        ...(comprasPorBudgetLine[rubrica.budgetline_id] || []),
        ...(comprasPorBudgetLine[rubrica.budget_line_id] || []),
        ...(comprasPorBudgetLine[rubrica.linha_orcamentaria_id] || []),
        ...(comprasPorRubrica[rubrica.id] || [])
      ];

      // remover duplicidade
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

      // regra principal:
      // se houver compras pagas vinculadas, elas mandam no valor_utilizado
      // senão, usa lançamentos
      const valorUtilizadoBase =
        valorComprasPagas > 0 ? valorComprasPagas : valorLancamentos;

      const valorUtilizado = parseFloat(valorUtilizadoBase.toFixed(2));
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
      });

      results.push({
        rubrica_id: rubrica.id,
        rubrica: rubrica.rubrica,
        grupo: rubrica.grupo,
        num_lancamentos: lans.length,
        num_compras_encontradas: comprasUnicas.length,
        num_compras_pagas: comprasPagas.length,
        valor_rubrica: valorRubrica,
        valor_lancamentos: valorLancamentos,
        valor_compras_pagas: valorComprasPagas,
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
        fonte_utilizada: valorComprasPagas > 0 ? 'compras_pagas' : 'lancamentos',
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
      ),
    };

    return Response.json({ success: true, trigger: body?.trigger || null, sumario, results });
  } catch (error) {
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});