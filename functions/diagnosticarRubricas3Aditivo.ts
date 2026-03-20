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
    const body = await req.json().catch(() => ({}));

    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const purchaseIdFiltro = body?.purchaseId || body?.purchase_id || null;
    const rubricaIdFiltro = body?.rubricaId || body?.rubrica_id || null;
    const statusFiltro = normalizeStatus(body?.status || '');

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
    const rubricasDuplicadas = [];

    for (const r of allRubricas) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, {
          ...r,
          rubrica_key: key,
        });
      } else {
        rubricasDuplicadas.push({
          id: r?.id || null,
          rubrica: r?.rubrica || r?.nome || null,
          grupo: r?.grupo || null,
          rubrica_key: key,
        });
      }
    }

    const rubricasUnicas = Array.from(rubricasMap.values());

    const budgetLineById = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const purchasesFiltradas = (allPurchases || []).filter((purchase) => {
      if (purchaseIdFiltro && purchase.id !== purchaseIdFiltro) return false;
      if (statusFiltro && normalizeStatus(purchase.status) !== statusFiltro) return false;
      return true;
    });

    const diagnostico = [];

    for (const purchase of purchasesFiltradas) {
      const status = normalizeStatus(purchase.status);
      const budgetlineId = getPurchaseBudgetlineId(purchase);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      const rubricaResolvida =
        resolved.rubricaId
          ? rubricasUnicas.find((r) => r.id === resolved.rubricaId) || null
          : null;

      const purchaseRubricaKey = rubricaResolvida
        ? rubricaResolvida.rubrica_key || buildRubricaKey(rubricaResolvida)
        : null;

      if (rubricaIdFiltro && resolved.rubricaId !== rubricaIdFiltro) {
        continue;
      }

      let severidade = 'ok';
      let problema = null;
      let sugestao = null;

      if (budgetlineId && !budgetLineById[budgetlineId]) {
        severidade = 'alta';
        problema = 'budgetline_id não encontrado na entidade BudgetLine';
        sugestao = 'Corrigir a linha orçamentária vinculada na compra.';
      } else if (
        (status === 'PAGO' || status === 'PAGO_PARCIAL') &&
        !resolved.rubricaId
      ) {
        severidade = 'alta';
        problema = resolved.motivo || 'Compra paga sem rubrica resolvida';
        sugestao =
          'Vincular rubrica_id ou corrigir budgetline_id e recalcular as rubricas.';
      } else if (
        (status === 'APROVADO_COORD' || status === 'APROVADO_ADMIN') &&
        !resolved.rubricaId
      ) {
        severidade = 'media';
        problema = resolved.motivo || 'Compra aprovada sem rubrica resolvida';
        sugestao = 'Vincular rubrica antes de marcar pagamento.';
      } else if (
        purchase.rubrica_id &&
        resolved.rubricaId &&
        purchase.rubrica_id !== resolved.rubricaId
      ) {
        severidade = 'media';
        problema = 'rubrica_id da compra diverge da rubrica resolvida';
        sugestao = 'Revisar rubrica_id da compra e padronizar o vínculo.';
      }

      diagnostico.push({
        purchase_id: purchase.id,
        descricao_item:
          purchase.descricao_item || purchase.titulo || purchase.objeto || '',
        fornecedor: purchase.fornecedor_nome || purchase.fornecedor || '',
        museu: purchase.museu || purchase.centro_custo || '',
        status: purchase.status || '',
        valor: getPurchaseValue(purchase),
        rubrica_id_informada: purchase.rubrica_id || null,
        rubrica_id_resolvida: resolved.rubricaId,
        rubrica_resolvida: rubricaResolvida?.rubrica || null,
        rubrica_key_resolvida: purchaseRubricaKey,
        budgetline_id: budgetlineId,
        budgetline_descricao:
          budgetLineById[budgetlineId]?.descricao ||
          budgetLineById[budgetlineId]?.nome ||
          null,
        origem_resolucao: resolved.origem,
        severidade,
        problema,
        sugestao,
      });
    }

    const totalProblemas = diagnostico.filter((d) => d.problema).length;
    const totalPagasSemRubrica = diagnostico.filter((d) => {
      const s = normalizeStatus(d.status);
      return (s === 'PAGO' || s === 'PAGO_PARCIAL') && !d.rubrica_id_resolvida;
    }).length;

    const totalAprovadasSemRubrica = diagnostico.filter((d) => {
      const s = normalizeStatus(d.status);
      return (
        (s === 'APROVADO_ADMIN' || s === 'APROVADO_COORD') &&
        !d.rubrica_id_resolvida
      );
    }).length;

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      purchase_id_filtrado: purchaseIdFiltro,
      rubrica_id_filtrado: rubricaIdFiltro,
      status_filtrado: statusFiltro || null,
      total_compras_analisadas: purchasesFiltradas.length,
      total_rubricas_raw: allRubricas.length,
      total_rubricas_unicas: rubricasUnicas.length,
      total_rubricas_duplicadas: rubricasDuplicadas.length,
      total_budgetlines: allBudgetLines.length,
      total_problemas: totalProblemas,
      total_pagas_sem_rubrica: totalPagasSemRubrica,
      total_aprovadas_sem_rubrica: totalAprovadasSemRubrica,
      rubricas_duplicadas: rubricasDuplicadas,
      diagnostico,
    });
  } catch (error) {
    console.error('diagnosticarRubricas3Aditivo error:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});
