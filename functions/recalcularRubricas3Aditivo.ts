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

function buildRubricaKey(rubrica) {
  const grupo = normalizeText(rubrica?.grupo || '');
  const nome = normalizeText(
    rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || ''
  );
  return `${grupo}__${nome}`;
}

function getPurchaseBudgetlineId(compra) {
  return (
    compra?.budgetline_id ||
    compra?.budget_line_id ||
    compra?.linha_orcamentaria_id ||
    null
  );
}

function getPurchaseValue(compra) {
  return (
    toNumber(compra?.valor_pago) ||
    toNumber(compra?.valor_aprovado_admin) ||
    toNumber(compra?.valor_aprovado) ||
    toNumber(compra?.valor_final) ||
    toNumber(compra?.valor_solicitado) ||
    0
  );
}

async function listAll(entityApi, orderBy = '', pageSize = 200) {
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

function resolveRubricaFromPurchase(compra, rubricas, budgetLineById) {
  if (compra?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === compra.rubrica_id);
    if (rubrica) {
      return {
        rubricaId: rubrica.id,
        origem: 'rubrica_id',
        motivo: null,
      };
    }
  }

  const budgetlineId = getPurchaseBudgetlineId(compra);

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

    const nomeBudgetLine = normalizeText(
      budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || ''
    );

    if (nomeBudgetLine) {
      const matches = rubricas.filter((r) => {
        const nomeRubrica = normalizeText(
          r?.rubrica || r?.nome || r?.descricao || ''
        );
        const rubricaKey = r?.rubrica_key || buildRubricaKey(r);
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

    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const [rubricasRaw, purchases, budgetLines, lancamentos] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 200),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'codigo', 200).catch(() => []),
      listAll(
        base44.asServiceRole.entities.LancamentoRubrica,
        '-created_date',
        500
      ).catch(() => []),
    ]);

    const rubricasMap = new Map();
    for (const rubrica of rubricasRaw) {
      const key = rubrica?.rubrica_key || buildRubricaKey(rubrica);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, rubrica);
      }
    }
    const rubricas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const line of budgetLines || []) {
      if (line?.id) budgetLineById[line.id] = line;
    }

    const lancamentosPorRubrica = new Map();
    for (const lancamento of lancamentos || []) {
      if (!lancamento?.rubrica_id) continue;
      if (!lancamentosPorRubrica.has(lancamento.rubrica_id)) {
        lancamentosPorRubrica.set(lancamento.rubrica_id, []);
      }
      lancamentosPorRubrica.get(lancamento.rubrica_id).push(lancamento);
    }

    const comprasPagasPorRubrica = new Map();
    const comprasAprovadasPorRubrica = new Map();
    const inconsistencias = [];

    for (const compra of purchases || []) {
      const status = normalizeStatus(compra.status);
      const resolved = resolveRubricaFromPurchase(
        compra,
        rubricas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        if (
          status === 'PAGO' ||
          status === 'APROVADO_COORD' ||
          status === 'APROVADO_ADMIN'
        ) {
          inconsistencias.push({
            purchase_id: compra.id,
            descricao_item: compra.descricao_item || '',
            fornecedor: compra.fornecedor_nome || compra.fornecedor || '',
            status: compra.status || '',
            valor: getPurchaseValue(compra),
            rubrica_id: compra.rubrica_id || null,
            budgetline_id: getPurchaseBudgetlineId(compra),
            motivo: resolved.motivo,
          });
        }
        continue;
      }

      if (status === 'PAGO' || status === 'PAGO_PARCIAL') {
        if (!comprasPagasPorRubrica.has(resolved.rubricaId)) {
          comprasPagasPorRubrica.set(resolved.rubricaId, []);
        }
        comprasPagasPorRubrica.get(resolved.rubricaId).push(compra);
      }

      if (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') {
        if (!comprasAprovadasPorRubrica.has(resolved.rubricaId)) {
          comprasAprovadasPorRubrica.set(resolved.rubricaId, []);
        }
        comprasAprovadasPorRubrica.get(resolved.rubricaId).push(compra);
      }
    }

    let totalPrevisto = 0;
    let totalUtilizado = 0;
    let saldoTotal = 0;

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const valorRubrica = toNumber(rubrica.valor_rubrica);

      const valorLancamentos = toNumber(
        (lancamentosPorRubrica.get(rubricaId) || []).reduce(
          (sum, l) => sum + toNumber(l.valor),
          0
        ).toFixed(2)
      );

      const valorComprasPagas = toNumber(
        (comprasPagasPorRubrica.get(rubricaId) || []).reduce(
          (sum, compra) => sum + getPurchaseValue(compra),
          0
        ).toFixed(2)
      );

      const valorComprasComprometidas = toNumber(
        (comprasAprovadasPorRubrica.get(rubricaId) || []).reduce(
          (sum, compra) => sum + getPurchaseValue(compra),
          0
        ).toFixed(2)
      );

      const valorUtilizado = toNumber(
        (valorComprasPagas + valorComprasComprometidas + valorLancamentos).toFixed(2)
      );

      const saldo = toNumber((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? toNumber(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubricaId, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
        rubrica_key: rubrica.rubrica_key || buildRubricaKey(rubrica),
      });

      totalPrevisto += valorRubrica;
      totalUtilizado += valorUtilizado;
      saldoTotal += saldo;
    }

    return Response.json({
      success: true,
      total_rubricas: rubricas.length,
      total_rubricas_raw: rubricasRaw.length,
      total_previsto: toNumber(totalPrevisto.toFixed(2)),
      total_utilizado: toNumber(totalUtilizado.toFixed(2)),
      saldo_total: toNumber(saldoTotal.toFixed(2)),
      compras_pagas_sem_rubrica: inconsistencias.filter(
        (i) => normalizeStatus(i.status) === 'PAGO'
      ).length,
      compras_aprovadas_sem_rubrica: inconsistencias.filter((i) => {
        const s = normalizeStatus(i.status);
        return s === 'APROVADO_COORD' || s === 'APROVADO_ADMIN';
      }).length,
      total_inconsistencias: inconsistencias.length,
      inconsistencias,
    });
  } catch (error) {
    console.error('recalcularRubricas3Aditivo error:', error);

    return Response.json(
      {
        success: false,
        error: error.message || 'Erro ao recalcular rubricas',
      },
      { status: 500 }
    );
  }
});