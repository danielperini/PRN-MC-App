import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MUSEUS = ['MIS', 'MUMO', 'MHAB'];

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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeMuseum(value) {
  const text = normalizeText(value).toUpperCase();
  for (const museu of MUSEUS) {
    if (text.includes(museu)) return museu;
  }
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function detectMuseumFromTexts(...values) {
  for (const value of values) {
    const museu = normalizeMuseum(value);
    if (museu) return museu;
  }
  return null;
}

function detectRubricaMuseum(rubrica) {
  return detectMuseumFromTexts(
    rubrica?.museu,
    rubrica?.museum,
    rubrica?.unidade,
    rubrica?.centro_custo,
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao
  );
}

function detectBudgetLineMuseum(line) {
  return detectMuseumFromTexts(
    line?.museu,
    line?.museum,
    line?.unidade,
    line?.centro_custo,
    line?.codigo,
    line?.descricao,
    line?.nome
  );
}

function detectPurchaseMuseum(compra) {
  return detectMuseumFromTexts(
    compra?.museu,
    compra?.museum,
    compra?.museu_destino,
    compra?.unidade,
    compra?.centro_custo,
    compra?.area,
    compra?.local,
    compra?.setor,
    compra?.departamento,
    compra?.categoria,
    compra?.titulo,
    compra?.descricao,
    compra?.descricao_item,
    compra?.objeto,
    compra?.observacoes,
    compra?.notes
  );
}

function buildRubricaNomeKey(nome) {
  return normalizeText(nome);
}

function buildRubricaNomeMuseuKey(nome, museu) {
  return `${buildRubricaNomeKey(nome)}::${museu || 'GERAL'}`;
}

function getPurchaseValue(compra) {
  return (
    toNumber(compra?.valor_pago) ||
    toNumber(compra?.valor_final) ||
    toNumber(compra?.valor_aprovado) ||
    toNumber(compra?.valor_solicitado) ||
    0
  );
}

function isPaidPurchase(compra) {
  return String(compra?.status || '').trim().toUpperCase() === 'PAGO';
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

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      200
    );

    const purchases = await listAll(
      base44.asServiceRole.entities.PurchaseRequest,
      '-created_date',
      300
    );

    let budgetLines = [];
    try {
      budgetLines = await listAll(
        base44.asServiceRole.entities.BudgetLine,
        'codigo',
        200
      );
    } catch (_e) {
      budgetLines = [];
    }

    const rubricaById = new Map();
    const rubricaByNomeMuseu = new Map();
    const rubricaGeralByNome = new Map();

    for (const rubrica of rubricas) {
      rubricaById.set(rubrica.id, rubrica);

      const nomeKey = buildRubricaNomeKey(
        firstNonEmpty(rubrica?.rubrica, rubrica?.nome, rubrica?.descricao)
      );
      const museu = detectRubricaMuseum(rubrica);

      rubricaByNomeMuseu.set(
        buildRubricaNomeMuseuKey(nomeKey, museu),
        rubrica
      );

      if (!museu && !rubricaGeralByNome.has(nomeKey)) {
        rubricaGeralByNome.set(nomeKey, rubrica);
      }
    }

    const budgetLineById = new Map();
    const budgetLineToRubrica = new Map();

    for (const line of budgetLines) {
      budgetLineById.set(line.id, line);

      const descricaoBase = firstNonEmpty(line?.descricao, line?.nome, line?.codigo);
      const descricaoKey = buildRubricaNomeKey(descricaoBase);
      const museuLine = detectBudgetLineMuseum(line);

      const rubricaEspecifica = rubricaByNomeMuseu.get(
        buildRubricaNomeMuseuKey(descricaoKey, museuLine)
      );

      const rubricaGeral = rubricaGeralByNome.get(descricaoKey);

      const encontrada = rubricaEspecifica || rubricaGeral || null;

      if (encontrada?.id) {
        budgetLineToRubrica.set(line.id, encontrada.id);
      }
    }

    function findRubricaByNameAndMuseum(nome, museu) {
      const nomeKey = buildRubricaNomeKey(nome);
      if (!nomeKey) return null;

      if (museu) {
        const especifica = rubricaByNomeMuseu.get(
          buildRubricaNomeMuseuKey(nomeKey, museu)
        );
        if (especifica) return especifica;
      }

      return rubricaGeralByNome.get(nomeKey) || null;
    }

    function adjustRubricaToPurchaseMuseum(rubricaId, compraMuseu) {
      if (!rubricaId) return null;

      const rubrica = rubricaById.get(rubricaId);
      if (!rubrica) return rubricaId;

      if (!compraMuseu) return rubricaId;

      const rubricaMuseu = detectRubricaMuseum(rubrica);
      if (rubricaMuseu === compraMuseu) return rubricaId;

      const nomeBase = firstNonEmpty(
        rubrica?.rubrica,
        rubrica?.nome,
        rubrica?.descricao
      );

      const rubricaEspecificaDoMuseu = findRubricaByNameAndMuseum(
        nomeBase,
        compraMuseu
      );

      if (rubricaEspecificaDoMuseu?.id) {
        return rubricaEspecificaDoMuseu.id;
      }

      return rubricaId;
    }

    function resolveRubricaIdForPurchase(compra) {
      const compraMuseu = detectPurchaseMuseum(compra);

      if (compra?.rubrica_id) {
        return adjustRubricaToPurchaseMuseum(compra.rubrica_id, compraMuseu);
      }

      if (compra?.budgetline_id) {
        const budgetLine = budgetLineById.get(compra.budgetline_id) || null;
        const budgetLineRubricaId =
          budgetLineToRubrica.get(compra.budgetline_id) || null;

        if (budgetLineRubricaId) {
          const museuPreferencial =
            compraMuseu || detectBudgetLineMuseum(budgetLine);
          return adjustRubricaToPurchaseMuseum(
            budgetLineRubricaId,
            museuPreferencial
          );
        }

        const nomeLine = firstNonEmpty(
          budgetLine?.descricao,
          budgetLine?.nome,
          budgetLine?.codigo
        );

        if (nomeLine) {
          const rubricaPorNome = findRubricaByNameAndMuseum(
            nomeLine,
            compraMuseu || detectBudgetLineMuseum(budgetLine)
          );
          if (rubricaPorNome?.id) return rubricaPorNome.id;
        }
      }

      const nomeRubricaCompra = firstNonEmpty(
        compra?.rubrica,
        compra?.rubrica_nome,
        compra?.categoria,
        compra?.subcategoria
      );

      if (nomeRubricaCompra) {
        const rubricaPorNome = findRubricaByNameAndMuseum(
          nomeRubricaCompra,
          compraMuseu
        );
        if (rubricaPorNome?.id) return rubricaPorNome.id;
      }

      /* 🔥 FIX: fallback GLOBAL */
      const fallbackGlobal = rubricas.find((r) => {
        const museu = detectRubricaMuseum(r);
        return !museu;
      });

      return fallbackGlobal?.id || null;
    }

    const totalPorRubrica = new Map();
    let comprasPagasSemRubrica = 0;

    for (const compra of purchases) {
      if (!isPaidPurchase(compra)) continue;

      const rubricaId = resolveRubricaIdForPurchase(compra);

      if (!rubricaId) {
        comprasPagasSemRubrica++;
        continue;
      }

      const valor = getPurchaseValue(compra);

      totalPorRubrica.set(
        rubricaId,
        (totalPorRubrica.get(rubricaId) || 0) + valor
      );
    }

    let totalPrevisto = 0;
    let totalUtilizado = 0;
    let saldoTotal = 0;

    for (const rubrica of rubricas) {
      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const valorUtilizado = toNumber(totalPorRubrica.get(rubrica.id) || 0);
      const saldo = valorRubrica - valorUtilizado;
      const percentualUtilizado =
        valorRubrica > 0
          ? Math.round((valorUtilizado / valorRubrica) * 10000) / 100
          : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
      });

      totalPrevisto += valorRubrica;
      totalUtilizado += valorUtilizado;
      saldoTotal += saldo;
    }

    return Response.json({
      success: true,
      total_rubricas: rubricas.length,
      total_previsto: totalPrevisto,
      total_utilizado: totalUtilizado,
      saldo_total: saldoTotal,
      compras_pagas_sem_rubrica: comprasPagasSemRubrica,
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
