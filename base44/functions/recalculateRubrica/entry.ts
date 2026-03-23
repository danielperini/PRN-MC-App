import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: unknown): string {
  const raw = normalizeString(value);

  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';

  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';

  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim().toUpperCase();
}

function buildRubricaKey(rubrica: any): string {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(
    rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || ''
  );
  const museu = normalizeMuseu(
    rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || ''
  );

  return `${grupo}__${nome}__${museu || 'GLOBAL'}`;
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseBudgetlineId(purchase: any): string | null {
  return (
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null
  );
}

function getPurchaseCentroCusto(purchase: any): string {
  return normalizeMuseu(
    purchase?.centro_custo ||
      purchase?.museu ||
      purchase?.museu_codigo ||
      purchase?.unidade ||
      ''
  );
}

function getRubricaCentroCusto(rubrica: any): string {
  return normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getBudgetLineCentroCusto(budgetLine: any): string {
  return normalizeMuseu(
    budgetLine?.centro_custo ||
      budgetLine?.museu ||
      budgetLine?.museu_codigo ||
      budgetLine?.unidade ||
      ''
  );
}

function getLancamentoCentroCusto(lancamento: any): string {
  return normalizeMuseu(
    lancamento?.centro_custo ||
      lancamento?.museu ||
      lancamento?.museu_codigo ||
      lancamento?.unidade ||
      ''
  );
}

function sameMuseuOrGlobal(entityMuseu: string, itemMuseu: string): boolean {
  if (!itemMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === itemMuseu;
}

function buildRubricaMuseuKey(rubricaId: string, museu: string): string {
  return `${rubricaId}__${normalizeMuseu(museu) || 'SEM_MUSEU'}`;
}

function safeJsonParse(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractPlanValueFromObject(
  obj: Record<string, unknown> | null,
  museu: string
): number {
  if (!obj) return 0;

  const normalizedMuseu = normalizeMuseu(museu);
  const aliases = [
    normalizedMuseu,
    normalizedMuseu.toLowerCase(),
    normalizedMuseu.toUpperCase(),
  ];

  for (const key of aliases) {
    if (key in obj) {
      return toNumber(obj[key]);
    }
  }

  return 0;
}

function getRubricaPlannedDistribution(
  rubrica: any,
  options?: { splitEvenlyByMuseu?: boolean; museusConsiderados?: string[] }
) {
  const museusBase = Array.from(
    new Set(
      (options?.museusConsiderados || DEFAULT_MUSEUS)
        .map((m) => normalizeMuseu(m))
        .filter(Boolean)
    )
  );

  const totalRubrica = toNumber(rubrica?.valor_rubrica);

  const explicitMap: Record<string, number> = {
    MIS: toNumber(rubrica?.valor_mis ?? rubrica?.orcado_mis ?? rubrica?.planejado_mis),
    MHAB: toNumber(rubrica?.valor_mhab ?? rubrica?.orcado_mhab ?? rubrica?.planejado_mhab),
    MUMO: toNumber(rubrica?.valor_mumo ?? rubrica?.orcado_mumo ?? rubrica?.planejado_mumo),
  };

  const jsonDistribuicao =
    safeJsonParse(rubrica?.distribuicao_por_museu_json) ||
    safeJsonParse(rubrica?.rateio_por_museu_json) ||
    safeJsonParse(rubrica?.orcamento_por_museu_json) ||
    safeJsonParse(rubrica?.saldo_por_museu_json);

  const distribuicao: Record<string, number> = {};
  let hasExplicitDistribution = false;

  for (const museu of museusBase) {
    const explicitValue =
      explicitMap[museu] || extractPlanValueFromObject(jsonDistribuicao, museu);

    if (explicitValue > 0) {
      distribuicao[museu] = explicitValue;
      hasExplicitDistribution = true;
    }
  }

  if (hasExplicitDistribution) {
    return {
      mode: 'explicit',
      total: totalRubrica,
      byMuseu: distribuicao,
    };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  if (rubricaMuseu) {
    return {
      mode: 'single_museu',
      total: totalRubrica,
      byMuseu: {
        [rubricaMuseu]: totalRubrica,
      },
    };
  }

  if (options?.splitEvenlyByMuseu && museusBase.length > 0) {
    const valorBase = Number((totalRubrica / museusBase.length).toFixed(2));
    const distribuicaoIgual: Record<string, number> = {};
    let acumulado = 0;

    museusBase.forEach((museu, index) => {
      if (index === museusBase.length - 1) {
        distribuicaoIgual[museu] = Number((totalRubrica - acumulado).toFixed(2));
      } else {
        distribuicaoIgual[museu] = valorBase;
        acumulado += valorBase;
      }
    });

    return {
      mode: 'equal_split',
      total: totalRubrica,
      byMuseu: distribuicaoIgual,
    };
  }

  return {
    mode: 'global_only',
    total: totalRubrica,
    byMuseu: {},
  };
}

async function findFirstRubricaByFilter(base44: any, filterObj: Record<string, unknown>) {
  try {
    const result = await base44.asServiceRole.entities.Rubrica.filter(filterObj);
    return result && result.length > 0 ? result[0] : null;
  } catch {
    return null;
  }
}

async function listAll(entityApi: any, orderBy = '', pageSize = 500) {
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

async function getAllLancamentos(base44: any, rubricaId: string) {
  const pageSize = 500;
  let allLancamentos: any[] = [];
  let page = 0;

  while (true) {
    const batch = await base44.asServiceRole.entities.LancamentoRubrica.filter(
      { rubrica_id: rubricaId },
      '-created_date',
      pageSize,
      page * pageSize
    );

    if (!batch || batch.length === 0) break;

    allLancamentos = allLancamentos.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return allLancamentos;
}

function resolveRubricaFromPurchase(
  purchase: any,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);

    if (!rubrica) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_nao_encontrada',
        motivo: 'rubrica_id informado na compra não foi encontrado',
      };
    }

    const rubricaMuseu = getRubricaCentroCusto(rubrica);

    if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_incompativel_museu',
        motivo: `Rubrica vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
      };
    }

    const blId = getPurchaseBudgetlineId(purchase);

    if (blId) {
      const bl = budgetLineById[blId];

      if (!bl) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_nao_encontrada',
          motivo: 'BudgetLine vinculada na compra não foi encontrada',
        };
      }

      const budgetMuseu = getBudgetLineCentroCusto(bl);

      if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_incompativel_museu',
          motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
        };
      }

      if (bl?.rubrica_id && bl.rubrica_id !== rubrica.id) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_rubrica_divergente',
          motivo: 'BudgetLine aponta para rubrica diferente da rubrica_id informada na compra',
        };
      }
    }

    return {
      rubricaId: rubrica.id,
      rubricaMuseu,
      purchaseMuseu,
      origem: 'rubrica_id',
      motivo: null,
    };
  }

  const budgetlineId = getPurchaseBudgetlineId(purchase);

  if (!budgetlineId) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'sem_rubrica_id_e_sem_budgetline',
      motivo: 'Compra sem rubrica_id e sem BudgetLine vinculada',
    };
  }

  const budgetLine = budgetLineById[budgetlineId];

  if (!budgetLine) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_nao_encontrada',
      motivo: 'BudgetLine vinculada na compra não foi encontrada',
    };
  }

  const budgetMuseu = getBudgetLineCentroCusto(budgetLine);

  if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_incompativel_museu',
      motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  if (!budgetLine?.rubrica_id) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_sem_rubrica_id',
      motivo: 'BudgetLine não possui rubrica_id vinculado',
    };
  }

  const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);

  if (!rubrica) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_nao_encontrada',
      motivo: 'rubrica_id da BudgetLine não foi encontrado',
    };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);

  if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_incompativel_museu',
      motivo: `Rubrica da BudgetLine vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  return {
    rubricaId: rubrica.id,
    rubricaMuseu,
    purchaseMuseu,
    origem: 'budgetline_rubrica_id',
    motivo: null,
  };
}

function resolveLancamentoForRubrica(lancamento: any, rubrica: any) {
  const lancamentoMuseu = getLancamentoCentroCusto(lancamento);
  const rubricaMuseu = getRubricaCentroCusto(rubrica);

  if (!sameMuseuOrGlobal(rubricaMuseu, lancamentoMuseu)) {
    return {
      valido: false,
      lancamentoMuseu,
      rubricaMuseu,
      motivo: `Lançamento vinculado ao museu ${lancamentoMuseu}, mas a rubrica está em ${rubricaMuseu}`,
    };
  }

  return {
    valido: true,
    lancamentoMuseu,
    rubricaMuseu,
    motivo: null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let rubricaId = body.rubricaId || body.rubrica_id || null;
    let budgetlineId = body.budgetline_id || body.budgetlineId || null;
    const purchaseId = body.purchaseId || body.purchase_id || null;
    const splitEvenlyByMuseu = Boolean(body?.split_evenly_by_museu);

    if (!rubricaId && body.data?.rubrica_id) {
      rubricaId = body.data.rubrica_id;
    }

    if (!rubricaId && body.event?.entity_id) {
      try {
        const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.filter({
          id: body.event.entity_id,
        });

        if (lancamentos && lancamentos.length > 0) {
          rubricaId = lancamentos[0].rubrica_id || rubricaId;
        }
      } catch {}
    }

    if (!budgetlineId && purchaseId) {
      try {
        const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
        if (purchase) {
          budgetlineId = getPurchaseBudgetlineId(purchase);
          rubricaId = rubricaId || purchase.rubrica_id || null;
        }
      } catch {}
    }

    const allRubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      500
    );

    const rubricasMap = new Map<string, any>();
    for (const r of allRubricas) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      }
    }
    const rubricasUnicas = Array.from(rubricasMap.values());

    let rubrica: any = null;

    if (rubricaId) {
      rubrica =
        rubricasUnicas.find((r) => r.id === rubricaId) ||
        (await findFirstRubricaByFilter(base44, { id: rubricaId }));
    }

    if (!rubrica && budgetlineId) {
      rubrica =
        (await findFirstRubricaByFilter(base44, { budgetline_id: budgetlineId })) ||
        (await findFirstRubricaByFilter(base44, { budget_line_id: budgetlineId })) ||
        (await findFirstRubricaByFilter(base44, { linha_orcamentaria_id: budgetlineId })) ||
        null;
    }

    if (!rubrica && purchaseId) {
      try {
        const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

        const allBudgetLines = await listAll(
          base44.asServiceRole.entities.BudgetLine,
          'descricao',
          500
        );

        const budgetLineById: Record<string, any> = {};
        for (const bl of allBudgetLines) {
          if (bl?.id) budgetLineById[bl.id] = bl;
        }

        const resolved = resolveRubricaFromPurchase(
          purchase,
          rubricasUnicas,
          budgetLineById
        );

        if (resolved.rubricaId) {
          rubrica = rubricasUnicas.find((r) => r.id === resolved.rubricaId) || null;
        }
      } catch {}
    }

    if (!rubrica) {
      return Response.json(
        {
          error: 'Rubrica não encontrada',
          rubricaId,
          budgetlineId,
          purchaseId,
          success: false,
        },
        { status: 404 }
      );
    }

    const rubricaRealId = rubrica.id;

    budgetlineId =
      budgetlineId ||
      rubrica.budgetline_id ||
      rubrica.budget_line_id ||
      rubrica.linha_orcamentaria_id ||
      null;

    const allLancamentosBrutos = await getAllLancamentos(base44, rubricaRealId);

    const lancamentosValidos: any[] = [];
    const lancamentosInconsistentes: any[] = [];

    for (const l of allLancamentosBrutos) {
      const resolved = resolveLancamentoForRubrica(l, rubrica);

      if (!resolved.valido) {
        lancamentosInconsistentes.push({
          lancamento_id: l?.id || null,
          descricao: l?.descricao || l?.historico || l?.titulo || '',
          valor: toNumber(l?.valor),
          centro_custo: resolved.lancamentoMuseu || null,
          rubrica_id: l?.rubrica_id || null,
          rubrica_centro_custo: resolved.rubricaMuseu || null,
          motivo: resolved.motivo,
          origem: 'lancamento_incompativel_museu',
        });
        continue;
      }

      lancamentosValidos.push(l);
    }

    const valorLancamentos = Number(
      lancamentosValidos.reduce((sum, l) => sum + toNumber(l.valor), 0).toFixed(2)
    );

    const allBudgetLines = await listAll(
      base44.asServiceRole.entities.BudgetLine,
      'descricao',
      500
    );

    const budgetLineById: Record<string, any> = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) {
        budgetLineById[bl.id] = bl;
      }
    }

    const purchases = await listAll(
      base44.asServiceRole.entities.PurchaseRequest,
      '-created_date',
      500
    );

    const uniquePurchases: any[] = [];
    const purchaseMap: Record<string, any> = {};
    const inconsistencias: any[] = [];

    for (const p of purchases) {
      const resolved = resolveRubricaFromPurchase(
        p,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        if (
          normalizeStatus(p.status) === 'PAGO' ||
          normalizeStatus(p.status) === 'PAGO_PARCIAL'
        ) {
          inconsistencias.push({
            purchase_id: p.id,
            titulo: p.titulo || p.objeto || p.descricao_item || '',
            fornecedor: p.fornecedor || p.fornecedor_nome || '',
            valor_pago: toNumber(p.valor_pago),
            valor_referencia: getPurchaseValue(p),
            status: p.status,
            centro_custo: resolved.purchaseMuseu || null,
            rubrica_id: p.rubrica_id || null,
            budgetline_id: getPurchaseBudgetlineId(p),
            motivo: resolved.motivo,
            origem: resolved.origem,
          });
        }
        continue;
      }

      if (resolved.rubricaId !== rubricaRealId) continue;

      if (p?.id && !purchaseMap[p.id]) {
        purchaseMap[p.id] = p;
        uniquePurchases.push(p);
      }
    }

    if (purchaseId && !purchaseMap[purchaseId]) {
      try {
        const purchaseDireta = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

        if (purchaseDireta?.id) {
          const resolved = resolveRubricaFromPurchase(
            purchaseDireta,
            rubricasUnicas,
            budgetLineById
          );

          if (resolved.rubricaId === rubricaRealId) {
            purchaseMap[purchaseDireta.id] = purchaseDireta;
            uniquePurchases.push(purchaseDireta);
          }
        }
      } catch {}
    }

    const paidPurchases = uniquePurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return status === 'PAGO' || status === 'PAGO_PARCIAL';
    });

    const approvedPurchases = uniquePurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD';
    });

    const valorComprasPagas = Number(
      paidPurchases.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
    );

    const valorComprasComprometidas = Number(
      approvedPurchases.reduce((sum, p) => sum + getPurchaseValue(p), 0).toFixed(2)
    );

    const valorRubrica = toNumber(rubrica.valor_rubrica);

    const valorUtilizado = Number(
      (valorComprasPagas + valorComprasComprometidas + valorLancamentos).toFixed(2)
    );

    const saldo = Number((valorRubrica - valorUtilizado).toFixed(2));
    const percentualUtilizado =
      valorRubrica > 0
        ? Number(((valorUtilizado / valorRubrica) * 100).toFixed(2))
        : 0;

    const museusDetectados = new Set<string>(DEFAULT_MUSEUS);

    const rubricaMuseu = getRubricaCentroCusto(rubrica);
    if (rubricaMuseu) museusDetectados.add(rubricaMuseu);

    for (const p of uniquePurchases) {
      const museu = getPurchaseCentroCusto(p);
      if (museu) museusDetectados.add(museu);
    }

    for (const l of lancamentosValidos) {
      const museu = getLancamentoCentroCusto(l);
      if (museu) museusDetectados.add(museu);
    }

    const allMuseus = Array.from(museusDetectados).filter(Boolean);

    const distribution = getRubricaPlannedDistribution(rubrica, {
      splitEvenlyByMuseu,
      museusConsiderados: allMuseus,
    });

    const lancamentosPorMuseu: Record<string, any[]> = {};
    for (const l of lancamentosValidos) {
      const museu = getLancamentoCentroCusto(l);
      if (!museu) continue;
      const compositeKey = buildRubricaMuseuKey(rubricaRealId, museu);
      if (!lancamentosPorMuseu[compositeKey]) lancamentosPorMuseu[compositeKey] = [];
      lancamentosPorMuseu[compositeKey].push(l);
    }

    const comprasPagasPorMuseu: Record<string, any[]> = {};
    for (const p of paidPurchases) {
      const museu = getPurchaseCentroCusto(p);
      if (!museu) continue;
      const compositeKey = buildRubricaMuseuKey(rubricaRealId, museu);
      if (!comprasPagasPorMuseu[compositeKey]) comprasPagasPorMuseu[compositeKey] = [];
      comprasPagasPorMuseu[compositeKey].push(p);
    }

    const comprasAprovadasPorMuseu: Record<string, any[]> = {};
    for (const p of approvedPurchases) {
      const museu = getPurchaseCentroCusto(p);
      if (!museu) continue;
      const compositeKey = buildRubricaMuseuKey(rubricaRealId, museu);
      if (!comprasAprovadasPorMuseu[compositeKey]) {
        comprasAprovadasPorMuseu[compositeKey] = [];
      }
      comprasAprovadasPorMuseu[compositeKey].push(p);
    }

    const detalhamentoPorMuseu = allMuseus.map((museu) => {
      const compositeKey = buildRubricaMuseuKey(rubricaRealId, museu);

      const lansMuseu = lancamentosPorMuseu[compositeKey] || [];
      const comprasPagasMuseu = comprasPagasPorMuseu[compositeKey] || [];
      const comprasAprovadasMuseu = comprasAprovadasPorMuseu[compositeKey] || [];

      const valorLancamentosMuseu = Number(
        lansMuseu.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
      );

      const valorPagoMuseu = Number(
        comprasPagasMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorComprometidoMuseu = Number(
        comprasAprovadasMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorUtilizadoMuseu = Number(
        (valorPagoMuseu + valorComprometidoMuseu + valorLancamentosMuseu).toFixed(2)
      );

      const valorPlanejadoMuseu = Number(
        toNumber(distribution.byMuseu[museu] ?? 0).toFixed(2)
      );

      const saldoMuseu =
        valorPlanejadoMuseu > 0
          ? Number((valorPlanejadoMuseu - valorUtilizadoMuseu).toFixed(2))
          : null;

      const percentualMuseu =
        valorPlanejadoMuseu > 0
          ? Number(((valorUtilizadoMuseu / valorPlanejadoMuseu) * 100).toFixed(2))
          : null;

      return {
        museu,
        valor_planejado: valorPlanejadoMuseu,
        valor_pago: valorPagoMuseu,
        valor_comprometido: valorComprometidoMuseu,
        valor_lancamentos: valorLancamentosMuseu,
        valor_utilizado: valorUtilizadoMuseu,
        saldo: saldoMuseu,
        percentual_utilizado: percentualMuseu,
        num_compras_pagas: comprasPagasMuseu.length,
        num_compras_aprovadas: comprasAprovadasMuseu.length,
        num_lancamentos: lansMuseu.length,
        distribuicao_mode: distribution.mode,
      };
    });

    await base44.asServiceRole.entities.Rubrica.update(rubricaRealId, {
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
      rubrica_key: rubrica.rubrica_key || buildRubricaKey(rubrica),
      valor_lancamentos: valorLancamentos,
      valor_pago: valorComprasPagas,
      valor_comprometido: valorComprasComprometidas,
      num_lancamentos: lancamentosValidos.length,
      num_compras_pagas: paidPurchases.length,
      num_compras_aprovadas: approvedPurchases.length,
      detalhamento_por_museu: detalhamentoPorMuseu,
      detalhamento_por_museu_json: JSON.stringify(detalhamentoPorMuseu),
    });

    return Response.json({
      success: true,
      rubrica_id: rubricaRealId,
      rubrica: rubrica.rubrica || rubrica.nome || null,
      centro_custo: getRubricaCentroCusto(rubrica) || null,
      budgetline_id: budgetlineId || null,
      purchase_id: purchaseId || null,
      num_lancamentos: lancamentosValidos.length,
      num_lancamentos_inconsistentes: lancamentosInconsistentes.length,
      num_compras_encontradas: uniquePurchases.length,
      num_compras_pagas: paidPurchases.length,
      num_compras_aprovadas: approvedPurchases.length,
      valor_rubrica: valorRubrica,
      valor_lancamentos: valorLancamentos,
      valor_compras_pagas: valorComprasPagas,
      valor_compras_comprometidas: valorComprasComprometidas,
      valor_utilizado: valorUtilizado,
      saldo: saldo,
      percentual_utilizado: percentualUtilizado,
      distribuicao_mode: distribution.mode,
      detalhamento_por_museu: detalhamentoPorMuseu,
      fonte_utilizada: 'rubrica_source_of_truth',
      inconsistencias,
      lancamentos_inconsistentes: lancamentosInconsistentes,
    });
  } catch (error: any) {
    console.error('recalculateRubrica error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});
