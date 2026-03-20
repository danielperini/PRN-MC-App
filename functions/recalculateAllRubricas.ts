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

  const blId =
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id;

  if (blId) {
    const bl = budgetLineById[blId];

    if (bl?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === bl.rubrica_id);
      if (rubrica) {
        return {
          rubricaId: rubrica.id,
          origem: 'budgetline_id',
          motivo: null,
        };
      }
    }

    const nomeBL = normalizeString(
      bl?.descricao || bl?.rubrica || bl?.nome || ''
    );

    if (nomeBL) {
      const matches = rubricas.filter((r) => {
        const nomeRubrica = normalizeString(
          r?.rubrica || r?.nome || r?.descricao || ''
        );
        return nomeRubrica === nomeBL;
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

    const [rubricasRaw, allLancamentos, allPurchases, allBudgetLines] =
      await Promise.all([
        listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
        listAll(
          base44.asServiceRole.entities.LancamentoRubrica,
          '-created_date',
          500
        ),
        listAll(
          base44.asServiceRole.entities.PurchaseRequest,
          '-created_date',
          500
        ),
        listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
      ]);

    const rubricasMap = new Map();
    const rubricasDuplicadas = [];

    for (const r of rubricasRaw) {
      const key = r?.rubrica_key || buildRubricaKey(r);

      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      } else {
        rubricasDuplicadas.push(r);
      }
    }

    const rubricas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const lancamentosPorRubrica = {};
    for (const l of allLancamentos) {
      if (!l?.rubrica_id) continue;
      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);
    }

    const comprasPorRubrica = {};
    const comprasPorRubricaComprometida = {};
    const unmatchedPaidPurchases = [];

    for (const purchase of allPurchases) {
      const status = normalizeStatus(purchase.status);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        if (status === 'PAGO') {
          unmatchedPaidPurchases.push({
            purchase_id: purchase.id,
            titulo: purchase.titulo || purchase.objeto || '',
            fornecedor: purchase.fornecedor || '',
            valor_pago: toNumber(purchase.valor_pago),
            status: purchase.status,
            rubrica_id: purchase.rubrica_id || null,
            budgetline_id:
              purchase.budgetline_id ||
              purchase.budget_line_id ||
              purchase.linha_orcamentaria_id ||
              null,
            motivo: resolved.motivo,
          });
        }
        continue;
      }

      if (status === 'PAGO') {
        if (!comprasPorRubrica[resolved.rubricaId]) {
          comprasPorRubrica[resolved.rubricaId] = [];
        }
        comprasPorRubrica[resolved.rubricaId].push(purchase);
      }

      if (
        status === 'APROVADO_ADMIN' ||
        status === 'APROVADO_COORD'
      ) {
        if (!comprasPorRubricaComprometida[resolved.rubricaId]) {
          comprasPorRubricaComprometida[resolved.rubricaId] = [];
        }
        comprasPorRubricaComprometida[resolved.rubricaId].push(purchase);
      }
    }

    const results = [];

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;

      const lans = lancamentosPorRubrica[rubricaId] || [];
      const valorLancamentos = parseFloat(
        lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
      );

      const comprasPagas = comprasPorRubrica[rubricaId] || [];
      const comprasAprovadas =
        comprasPorRubricaComprometida[rubricaId] || [];

      const valorPago = parseFloat(
        comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorComprometido = parseFloat(
        comprasAprovadas
          .reduce((s, p) => s + getPurchaseValue(p), 0)
          .toFixed(2)
      );

      const valorUtilizado = parseFloat(
        (valorPago + valorComprometido + valorLancamentos).toFixed(2)
      );

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        rubrica_key: rubrica.rubrica_key || buildRubricaKey(rubrica),
        num_compras_pagas: comprasPagas.length,
        num_compras_aprovadas: comprasAprovadas.length,
        valor_pago: valorPago,
        valor_comprometido: valorComprometido,
        valor_lancamentos: valorLancamentos,
        valor_utilizado: valorUtilizado,
        valor_rubrica: valorRubrica,
        saldo,
        percentual_utilizado: percentualUtilizado,
        fonte: 'compras+lancamentos',
        _update: {
          valor_utilizado: valorUtilizado,
          saldo,
          percentual_utilizado: percentualUtilizado,
          rubrica_key: rubrica.rubrica_key || buildRubricaKey(rubrica),
        },
      });
    }

    const BATCH = 5;
    let updated = 0;

    for (let i = 0; i < results.length; i += BATCH) {
      const lote = results.slice(i, i + BATCH);
      try {
        await Promise.all(
          lote.map((r) =>
            base44.asServiceRole.entities.Rubrica.update(r.rubrica_id, r._update)
          )
        );
        updated += lote.length;
      } catch (e) {
        console.error('Erro ao atualizar lote:', e.message);
      }
    }

    const valor_total_orcado = parseFloat(
      results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2)
    );

    const valor_total_utilizado = parseFloat(
      results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2)
    );

    const valor_total_saldo = parseFloat(
      results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2)
    );

    const TETO_CORRETO = 1320000;
    const diferenca_total = parseFloat(
      (valor_total_orcado - TETO_CORRETO).toFixed(2)
    );

    const sumario = {
      total_rubricas_raw: rubricasRaw.length,
      total_rubricas_unicas: results.length,
      total_duplicadas_detectadas: rubricasDuplicadas.length,
      total_atualizadas: updated,
      total_compras: allPurchases.length,
      total_lancamentos: allLancamentos.length,
      valor_total_orcado,
      valor_total_utilizado,
      valor_total_saldo,
      teto_correto: TETO_CORRETO,
      diferenca_total,
      total_esta_correto: Math.abs(diferenca_total) < 0.01,
      compras_pagas_nao_vinculadas: unmatchedPaidPurchases.length,
    };

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      sumario,
      inconsistencias: unmatchedPaidPurchases,
      duplicadas: rubricasDuplicadas.map((r) => ({
        id: r.id,
        grupo: r.grupo || null,
        rubrica: r.rubrica || r.nome || null,
        valor_rubrica: toNumber(r.valor_rubrica),
        rubrica_key: r.rubrica_key || buildRubricaKey(r),
      })),
      results,
    });
  } catch (error) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});