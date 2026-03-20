import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function listAll(entityApi: any, orderBy = '', pageSize = 200) {
  let all: any[] = [];
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

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function buildBudgetLineToRubricaMap(base44: any) {
  const map = new Map<string, string>();

  try {
    const [budgetLines, rubricas] = await Promise.all([
      listAll(base44.asServiceRole.entities.BudgetLine, 'codigo', 200),
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 200),
    ]);

    const rubricaByNormalizedName = new Map<string, any>();
    for (const rubrica of rubricas) {
      rubricaByNormalizedName.set(normalizeText(rubrica?.rubrica), rubrica);
    }

    for (const line of budgetLines) {
      const byDescricao = rubricaByNormalizedName.get(normalizeText(line?.descricao));
      if (byDescricao?.id) {
        map.set(line.id, byDescricao.id);
      }
    }
  } catch (_err) {
    // fallback silencioso: segue sem mapeamento por BudgetLine
  }

  return map;
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

    const budgetLineToRubrica = await buildBudgetLineToRubricaMap(base44);

    const totalPorRubrica = new Map<string, number>();
    const detalhesPorRubrica = new Map<string, any[]>();
    let comprasPagasSemRubrica = 0;
    let origemCalculo = 'PurchaseRequest(PAGO)';

    // 1) Tentar priorizar LancamentoRubrica, se existir e tiver dados
    let usouLancamentos = false;
    try {
      const lancamentos = await listAll(
        base44.asServiceRole.entities.LancamentoRubrica,
        '-created_date',
        500
      );

      if (Array.isArray(lancamentos) && lancamentos.length > 0) {
        for (const lanc of lancamentos) {
          if (!lanc?.rubrica_id) continue;

          const valor = toNumber(lanc?.valor);
          totalPorRubrica.set(
            lanc.rubrica_id,
            (totalPorRubrica.get(lanc.rubrica_id) || 0) + valor
          );

          const lista = detalhesPorRubrica.get(lanc.rubrica_id) || [];
          lista.push({
            origem: 'LancamentoRubrica',
            id: lanc?.id,
            valor,
            descricao: lanc?.descricao || '',
            referencia_compra_id: lanc?.referencia_compra_id || null,
          });
          detalhesPorRubrica.set(lanc.rubrica_id, lista);
        }

        usouLancamentos = true;
        origemCalculo = 'LancamentoRubrica';
      }
    } catch (_err) {
      // entidade pode não existir ou não estar pronta
    }

    // 2) Fallback para compras pagas
    if (!usouLancamentos) {
      const purchases = await listAll(
        base44.asServiceRole.entities.PurchaseRequest,
        '-created_date',
        300
      );

      for (const compra of purchases) {
        if (compra?.status !== 'PAGO') continue;

        let rubricaId = compra?.rubrica_id || null;

        if (!rubricaId && compra?.budgetline_id) {
          rubricaId = budgetLineToRubrica.get(compra.budgetline_id) || null;
        }

        if (!rubricaId) {
          comprasPagasSemRubrica++;
          continue;
        }

        const valor =
          toNumber(compra?.valor_pago) ||
          toNumber(compra?.valor_final) ||
          toNumber(compra?.valor_aprovado) ||
          toNumber(compra?.valor_solicitado) ||
          0;

        totalPorRubrica.set(
          rubricaId,
          (totalPorRubrica.get(rubricaId) || 0) + valor
        );

        const lista = detalhesPorRubrica.get(rubricaId) || [];
        lista.push({
          origem: 'PurchaseRequest',
          id: compra?.id,
          valor,
          descricao: compra?.descricao_item || '',
          status: compra?.status || '',
        });
        detalhesPorRubrica.set(rubricaId, lista);
      }
    }

    let totalPrevisto = 0;
    let totalUtilizado = 0;
    let saldoTotal = 0;
    const atualizadas: any[] = [];

    for (const rubrica of rubricas) {
      const valorRubrica = toNumber(rubrica?.valor_rubrica);
      const valorUtilizado = toNumber(totalPorRubrica.get(rubrica.id) || 0);
      const saldo = valorRubrica - valorUtilizado;
      const percentualUtilizado =
        valorRubrica > 0 ? Number(((valorUtilizado / valorRubrica) * 100).toFixed(2)) : 0;

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
      });

      totalPrevisto += valorRubrica;
      totalUtilizado += valorUtilizado;
      saldoTotal += saldo;

      atualizadas.push({
        id: rubrica.id,
        rubrica: rubrica.rubrica,
        valor_rubrica: valorRubrica,
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
        itens_origem: (detalhesPorRubrica.get(rubrica.id) || []).length,
      });
    }

    return Response.json({
      success: true,
      origem_calculo: origemCalculo,
      total_rubricas: rubricas.length,
      total_previsto: totalPrevisto,
      total_utilizado: totalUtilizado,
      saldo_total: saldoTotal,
      compras_pagas_sem_rubrica: comprasPagasSemRubrica,
      rubricas_atualizadas: atualizadas.length,
      atualizadas,
    });
  } catch (error) {
    console.error('recalcularRubricas3Aditivo error:', error);

    return Response.json(
      {
        success: false,
        error: error?.message || 'Erro ao recalcular rubricas',
      },
      { status: 500 }
    );
  }
});
