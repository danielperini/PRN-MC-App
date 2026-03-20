import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    const rubricaByNome = new Map();
    for (const rubrica of rubricas) {
      rubricaByNome.set(normalizeText(rubrica.rubrica), rubrica);
    }

    const budgetLineToRubrica = new Map();
    for (const line of budgetLines) {
      const rubricaEncontrada = rubricaByNome.get(normalizeText(line.descricao));
      if (rubricaEncontrada?.id) {
        budgetLineToRubrica.set(line.id, rubricaEncontrada.id);
      }
    }

    const totalPorRubrica = new Map();
    let comprasPagasSemRubrica = 0;

    for (const compra of purchases) {
      if (compra.status !== 'PAGO') continue;

      let rubricaId = compra.rubrica_id || null;

      if (!rubricaId && compra.budgetline_id) {
        rubricaId = budgetLineToRubrica.get(compra.budgetline_id) || null;
      }

      if (!rubricaId) {
        comprasPagasSemRubrica++;
        continue;
      }

      const valor =
        toNumber(compra.valor_pago) ||
        toNumber(compra.valor_final) ||
        toNumber(compra.valor_aprovado) ||
        toNumber(compra.valor_solicitado) ||
        0;

      totalPorRubrica.set(
        rubricaId,
        (totalPorRubrica.get(rubricaId) || 0) + valor
      );
    }

    let total_previsto = 0;
    let total_utilizado = 0;
    let saldo_total = 0;

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

      total_previsto += valorRubrica;
      total_utilizado += valorUtilizado;
      saldo_total += saldo;
    }

    return Response.json({
      success: true,
      total_rubricas: rubricas.length,
      total_previsto,
      total_utilizado,
      saldo_total,
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