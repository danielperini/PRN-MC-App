import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
    toNumber(purchase?.valor_aprovado_admin) ||
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

    // Buscar tudo com paginação
    const rubricas = await listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500);
    const allLancamentos = await listAll(base44.asServiceRole.entities.LancamentoRubrica, '-created_date', 500);
    const allPurchases = await listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500);
    const allBudgetLines = await listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500);

    // Índices
    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    // Índice de lançamentos por rubrica_id
    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      if (!l?.rubrica_id) continue;
      if (!lancamentosPorRubrica[l.rubrica_id]) lancamentosPorRubrica[l.rubrica_id] = [];
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    // Índice de compras por rubrica_id (ligação direta)
    const comprasPorRubricaDireta = {};
    for (const p of allPurchases) {
      if (!p?.rubrica_id) continue;
      if (!comprasPorRubricaDireta[p.rubrica_id]) comprasPorRubricaDireta[p.rubrica_id] = [];
      comprasPorRubricaDireta[p.rubrica_id].push(p);
    }

    // Índice de compras por budgetline_id
    const comprasPorBudgetLine = {};
    for (const p of allPurchases) {
      const blId = p?.budgetline_id || p?.budget_line_id || p?.linha_orcamentaria_id;
      if (!blId) continue;
      if (!comprasPorBudgetLine[blId]) comprasPorBudgetLine[blId] = [];
      comprasPorBudgetLine[blId].push(p);
    }

    // Índice de compras por nome normalizado da budget line
    const comprasPorNomeBL = {};
    for (const p of allPurchases) {
      const blId = p?.budgetline_id || p?.budget_line_id || p?.linha_orcamentaria_id;
      if (!blId) continue;
      const bl = budgetLineById[blId];
      const nome = normalizeString(bl?.descricao || bl?.rubrica || bl?.nome || '');
      if (!nome) continue;
      if (!comprasPorNomeBL[nome]) comprasPorNomeBL[nome] = [];
      comprasPorNomeBL[nome].push(p);
    }

    const results = [];

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const budgetlineId = rubrica.budgetline_id || rubrica.budget_line_id || rubrica.linha_orcamentaria_id || null;
      const nomeRubrica = normalizeString(rubrica.rubrica || rubrica.nome || rubrica.descricao || '');

      // Lançamentos manuais
      const lans = lancamentosPorRubrica[rubricaId] || [];
      const valorLancamentos = parseFloat(lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));

      // Coletar compras relacionadas (direta, por budgetline, por nome)
      const mapaCompras = {};
      const addCompras = (list) => {
        for (const c of (list || [])) {
          if (c?.id) mapaCompras[c.id] = c;
        }
      };

      addCompras(comprasPorRubricaDireta[rubricaId]);
      if (budgetlineId) addCompras(comprasPorBudgetLine[budgetlineId]);
      if (nomeRubrica) addCompras(comprasPorNomeBL[nomeRubrica]);

      const comprasUnicas = Object.values(mapaCompras);

      // Separar por status
      const comprasPagas = comprasUnicas.filter(p => normalizeStatus(p.status) === 'PAGO');
      const comprasAprovadas = comprasUnicas.filter(p => {
        const s = normalizeStatus(p.status);
        return s === 'APROVADO_ADMIN' || s === 'APROVADO_COORD';
      });

      const valorPago = parseFloat(comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
      const valorComprometido = parseFloat(comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));

      const valorRubrica = toNumber(rubrica.valor_rubrica);

      // valor_utilizado = pago + comprometido (aprovado mas não pago ainda)
      // Prioridade: compras (pago + aprovado) > lançamentos manuais
      const totalCompras = valorPago + valorComprometido;
      const valorUtilizado = parseFloat((totalCompras > 0 ? totalCompras : valorLancamentos).toFixed(2));
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado = valorRubrica > 0
        ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado
      });

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        num_compras_pagas: comprasPagas.length,
        num_compras_aprovadas: comprasAprovadas.length,
        valor_pago: valorPago,
        valor_comprometido: valorComprometido,
        valor_lancamentos: valorLancamentos,
        valor_utilizado: valorUtilizado,
        valor_rubrica: valorRubrica,
        saldo,
        percentual_utilizado: percentualUtilizado,
        fonte: totalCompras > 0 ? 'compras' : 'lancamentos'
      });
    }

    const sumario = {
      total_rubricas: results.length,
      total_compras: allPurchases.length,
      total_lancamentos: allLancamentos.length,
      valor_total_orcado: parseFloat(results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2)),
      valor_total_utilizado: parseFloat(results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2)),
      valor_total_saldo: parseFloat(results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2))
    };

    return Response.json({ success: true, trigger: body?.trigger || null, sumario, results });
  } catch (error) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});