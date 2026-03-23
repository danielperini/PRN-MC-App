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
    const body = await req.json().catch(() => ({}));

    const [allPurchases, allRubricas, allBudgetLines] = await Promise.all([
      listAll(
        base44.asServiceRole.entities.PurchaseRequest,
        '-created_date',
        500
      ),
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
    ]);

    const rubricasMap = new Map();
    for (const r of allRubricas) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }
    const rubricasUnicas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const inconsistencias = [];

    for (const purchase of allPurchases) {
      const status = normalizeStatus(purchase.status);
      const budgetlineId = getPurchaseBudgetlineId(purchase);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      let motivo = null;
      let sugestao = null;

      if (status === 'PAGO' && !resolved.rubricaId) {
        motivo = resolved.motivo || 'Compra paga sem rubrica resolvida';
        sugestao = 'Vincular rubrica_id ou corrigir budgetline_id antes de novo recálculo.';
      } else if (
        (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') &&
        !resolved.rubricaId
      ) {
        motivo = resolved.motivo || 'Compra aprovada sem rubrica resolvida';
        sugestao = 'Vincular rubrica antes de marcar pagamento.';
      } else if (budgetlineId && !budgetLineById[budgetlineId]) {
        motivo = 'budgetline_id não encontrado na entidade BudgetLine';
        sugestao = 'Corrigir a linha orçamentária vinculada na compra.';
      }

      if (!motivo) continue;

      inconsistencias.push({
        purchase_id: purchase.id,
        titulo: purchase.titulo || purchase.objeto || purchase.descricao_item || '',
        fornecedor: purchase.fornecedor || purchase.fornecedor_nome || '',
        museu: purchase.museu || purchase.centro_custo || '',
        status: purchase.status || '',
        valor_pago: toNumber(purchase.valor_pago),
        valor_compra: getPurchaseValue(purchase),
        rubrica_id: purchase.rubrica_id || null,
        budgetline_id: budgetlineId,
        origem_resolucao: resolved.origem,
        motivo,
        sugestao,
      });
    }

    const totalPagasSemRubrica = inconsistencias.filter(
      (i) => normalizeStatus(i.status) === 'PAGO'
    ).length;

    const totalAprovadasSemRubrica = inconsistencias.filter((i) => {
      const s = normalizeStatus(i.status);
      return s === 'APROVADO_COORD' || s === 'APROVADO_ADMIN';
    }).length;

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      total_compras_analisadas: allPurchases.length,
      total_rubricas_unicas: rubricasUnicas.length,
      total_budgetlines: allBudgetLines.length,
      total_inconsistencias: inconsistencias.length,
      total_pagas_sem_rubrica: totalPagasSemRubrica,
      total_aprovadas_sem_rubrica: totalAprovadasSemRubrica,
      inconsistencias,
    });
  } catch (error) {
    console.error('auditarComprasSemRubrica error:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});
