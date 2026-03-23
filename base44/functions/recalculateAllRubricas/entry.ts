import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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

function buildRubricaMuseuKey(rubricaId: string, museu: string): string {
  return `${rubricaId}__${normalizeMuseu(museu) || 'SEM_MUSEU'}`;
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

async function listAll(entityApi: any, orderBy: string, pageSize = 500) {
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

    const blId =
      purchase?.budgetline_id ||
      purchase?.budget_line_id ||
      purchase?.linha_orcamentaria_id ||
      null;

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

  const blId =
    purchase?.budgetline_id ||
    purchase?.budget_line_id ||
    purchase?.linha_orcamentaria_id ||
    null;

  if (!blId) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'sem_rubrica_id_e_sem_budgetline',
      motivo: 'Compra sem rubrica_id e sem BudgetLine vinculada',
    };
  }

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

  if (!bl?.rubrica_id) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_sem_rubrica_id',
      motivo: 'BudgetLine não possui rubrica_id vinculado',
    };
  }

  const rubrica = rubricas.find((r) => r.id === bl.rubrica_id);

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

    const splitEvenlyByMuseu = Boolean(body?.split_evenly_by_museu);

    const [rubricasRaw, allLancamentos, allPurchases, allBudgetLines] =
      await Promise.all([
        listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
        listAll(base44.asServiceRole.entities.LancamentoRubrica, '-created_date', 500),
        listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
        listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
      ]);

    const rubricasMap = new Map<string, any>();
    const rubricasDuplicadas: any[] = [];

    for (const r of rubricasRaw) {
      const key = r?.rubrica_key || buildRubricaKey(r);

      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      } else {
        rubricasDuplicadas.push(r);
      }
    }

    const rubricas = Array.from(rubricasMap.values());

    const rubricaById: Record<string, any> = {};
    for (const rubrica of rubricas) {
      if (rubrica?.id) rubricaById[rubrica.id] = rubrica;
    }

    const budgetLineById: Record<string, any> = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const museusDetectados = new Set<string>(DEFAULT_MUSEUS);

    for (const purchase of allPurchases) {
      const museu = getPurchaseCentroCusto(purchase);
      if (museu) museusDetectados.add(museu);
    }

    for (const rubrica of rubricas) {
      const museu = getRubricaCentroCusto(rubrica);
      if (museu) museusDetectados.add(museu);
    }

    for (const bl of allBudgetLines) {
      const museu = getBudgetLineCentroCusto(bl);
      if (museu) museusDetectados.add(museu);
    }

    for (const lancamento of allLancamentos) {
      const museu = getLancamentoCentroCusto(lancamento);
      if (museu) museusDetectados.add(museu);
    }

    const allMuseus = Array.from(museusDetectados).filter(Boolean);

    const lancamentosPorRubrica: Record<string, any[]> = {};
    const lancamentosPorRubricaMuseu: Record<string, any[]> = {};
    const lancamentosInconsistentesMuseu: any[] = [];
    const lancamentosSemRubrica: any[] = [];

    for (const l of allLancamentos) {
      if (!l?.rubrica_id) {
        lancamentosSemRubrica.push({
          lancamento_id: l?.id || null,
          descricao: l?.descricao || l?.historico || l?.titulo || '',
          valor: toNumber(l?.valor),
          centro_custo: getLancamentoCentroCusto(l) || null,
          rubrica_id: null,
          motivo: 'Lançamento sem rubrica_id',
          origem: 'lancamento_sem_rubrica',
        });
        continue;
      }

      const rubrica = rubricaById[l.rubrica_id];

      if (!rubrica) {
        lancamentosSemRubrica.push({
          lancamento_id: l?.id || null,
          descricao: l?.descricao || l?.historico || l?.titulo || '',
          valor: toNumber(l?.valor),
          centro_custo: getLancamentoCentroCusto(l) || null,
          rubrica_id: l?.rubrica_id || null,
          motivo: 'rubrica_id do lançamento não encontrado',
          origem: 'lancamento_rubrica_nao_encontrada',
        });
        continue;
      }

      const resolvedLancamento = resolveLancamentoForRubrica(l, rubrica);

      if (!resolvedLancamento.valido) {
        lancamentosInconsistentesMuseu.push({
          lancamento_id: l?.id || null,
          descricao: l?.descricao || l?.historico || l?.titulo || '',
          valor: toNumber(l?.valor),
          centro_custo: resolvedLancamento.lancamentoMuseu || null,
          rubrica_id: l?.rubrica_id || null,
          rubrica_centro_custo: resolvedLancamento.rubricaMuseu || null,
          motivo: resolvedLancamento.motivo,
          origem: 'lancamento_incompativel_museu',
        });
        continue;
      }

      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);

      if (resolvedLancamento.lancamentoMuseu) {
        const compositeKey = buildRubricaMuseuKey(
          l.rubrica_id,
          resolvedLancamento.lancamentoMuseu
        );
        if (!lancamentosPorRubricaMuseu[compositeKey]) {
          lancamentosPorRubricaMuseu[compositeKey] = [];
        }
        lancamentosPorRubricaMuseu[compositeKey].push(l);
      }
    }

    const comprasPagasPorRubrica: Record<string, any[]> = {};
    const comprasAprovadasPorRubrica: Record<string, any[]> = {};
    const comprasPagasPorRubricaMuseu: Record<string, any[]> = {};
    const comprasAprovadasPorRubricaMuseu: Record<string, any[]> = {};

    const unmatchedPaidPurchases: any[] = [];
    const inconsistentMuseuPurchases: any[] = [];

    for (const purchase of allPurchases) {
      const status = normalizeStatus(purchase.status);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        const issue = {
          purchase_id: purchase.id,
          titulo: purchase.titulo || purchase.objeto || purchase.descricao_item || '',
          fornecedor: purchase.fornecedor || purchase.fornecedor_nome || '',
          valor_pago: toNumber(purchase.valor_pago),
          valor_referencia: getPurchaseValue(purchase),
          status: purchase.status,
          centro_custo: resolved.purchaseMuseu || null,
          rubrica_id: purchase.rubrica_id || null,
          budgetline_id:
            purchase.budgetline_id ||
            purchase.budget_line_id ||
            purchase.linha_orcamentaria_id ||
            null,
          motivo: resolved.motivo,
          origem: resolved.origem,
        };

        if (status === 'PAGO') {
          unmatchedPaidPurchases.push(issue);
        } else {
          inconsistentMuseuPurchases.push(issue);
        }
        continue;
      }

      const purchaseMuseu = resolved.purchaseMuseu || '';
      const rubricaId = resolved.rubricaId;
      const compositeKey = purchaseMuseu
        ? buildRubricaMuseuKey(rubricaId, purchaseMuseu)
        : '';

      if (status === 'PAGO') {
        if (!comprasPagasPorRubrica[rubricaId]) {
          comprasPagasPorRubrica[rubricaId] = [];
        }
        comprasPagasPorRubrica[rubricaId].push(purchase);

        if (compositeKey) {
          if (!comprasPagasPorRubricaMuseu[compositeKey]) {
            comprasPagasPorRubricaMuseu[compositeKey] = [];
          }
          comprasPagasPorRubricaMuseu[compositeKey].push(purchase);
        }
      }

      if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
        if (!comprasAprovadasPorRubrica[rubricaId]) {
          comprasAprovadasPorRubrica[rubricaId] = [];
        }
        comprasAprovadasPorRubrica[rubricaId].push(purchase);

        if (compositeKey) {
          if (!comprasAprovadasPorRubricaMuseu[compositeKey]) {
            comprasAprovadasPorRubricaMuseu[compositeKey] = [];
          }
          comprasAprovadasPorRubricaMuseu[compositeKey].push(purchase);
        }
      }
    }

    const results: any[] = [];
    const overviewByMuseu: Record<
      string,
      {
        valor_orcado: number;
        valor_pago: number;
        valor_comprometido: number;
        valor_lancamentos: number;
        valor_utilizado: number;
        saldo: number;
        total_rubricas: number;
      }
    > = {};

    for (const museu of allMuseus) {
      overviewByMuseu[museu] = {
        valor_orcado: 0,
        valor_pago: 0,
        valor_comprometido: 0,
        valor_lancamentos: 0,
        valor_utilizado: 0,
        saldo: 0,
        total_rubricas: 0,
      };
    }

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const rubricaKey = rubrica.rubrica_key || buildRubricaKey(rubrica);

      const lans = lancamentosPorRubrica[rubricaId] || [];
      const valorLancamentos = Number(
        lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
      );

      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];

      const valorPago = Number(
        comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorComprometido = Number(
        comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorUtilizado = Number(
        (valorPago + valorComprometido + valorLancamentos).toFixed(2)
      );

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const saldo = Number((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? Number(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      const distribution = getRubricaPlannedDistribution(rubrica, {
        splitEvenlyByMuseu,
        museusConsiderados: allMuseus,
      });

      const detalhamentoPorMuseu = allMuseus.map((museu) => {
        const compositeKey = buildRubricaMuseuKey(rubricaId, museu);

        const lansMuseu = lancamentosPorRubricaMuseu[compositeKey] || [];
        const comprasPagasMuseu = comprasPagasPorRubricaMuseu[compositeKey] || [];
        const comprasAprovadasMuseu =
          comprasAprovadasPorRubricaMuseu[compositeKey] || [];

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

        if (valorPlanejadoMuseu > 0 || valorUtilizadoMuseu > 0) {
          if (!overviewByMuseu[museu]) {
            overviewByMuseu[museu] = {
              valor_orcado: 0,
              valor_pago: 0,
              valor_comprometido: 0,
              valor_lancamentos: 0,
              valor_utilizado: 0,
              saldo: 0,
              total_rubricas: 0,
            };
          }

          overviewByMuseu[museu].valor_orcado = Number(
            (overviewByMuseu[museu].valor_orcado + valorPlanejadoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_pago = Number(
            (overviewByMuseu[museu].valor_pago + valorPagoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_comprometido = Number(
            (overviewByMuseu[museu].valor_comprometido + valorComprometidoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_lancamentos = Number(
            (overviewByMuseu[museu].valor_lancamentos + valorLancamentosMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_utilizado = Number(
            (overviewByMuseu[museu].valor_utilizado + valorUtilizadoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].saldo = Number(
            (overviewByMuseu[museu].saldo + (saldoMuseu === null ? 0 : saldoMuseu)).toFixed(2)
          );
          overviewByMuseu[museu].total_rubricas += 1;
        }

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

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        rubrica_key: rubricaKey,
        centro_custo: getRubricaCentroCusto(rubrica) || null,
        num_compras_pagas: comprasPagas.length,
        num_compras_aprovadas: comprasAprovadas.length,
        num_lancamentos: lans.length,
        valor_pago: valorPago,
        valor_comprometido: valorComprometido,
        valor_lancamentos: valorLancamentos,
        valor_utilizado: valorUtilizado,
        valor_rubrica: valorRubrica,
        saldo,
        percentual_utilizado: percentualUtilizado,
        distribuicao_mode: distribution.mode,
        detalhamento_por_museu: detalhamentoPorMuseu,
        fonte: 'rubrica_source_of_truth',
        _update: {
          valor_utilizado: valorUtilizado,
          saldo,
          percentual_utilizado: percentualUtilizado,
          rubrica_key: rubricaKey,
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
      } catch (e: any) {
        console.error('Erro ao atualizar lote:', e?.message || e);
      }
    }

    const valor_total_orcado = Number(
      results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2)
    );

    const valor_total_utilizado = Number(
      results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2)
    );

    const valor_total_saldo = Number(
      results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2)
    );

    const TETO_CORRETO = 1320000;
    const diferenca_total = Number((valor_total_orcado - TETO_CORRETO).toFixed(2));

    const sumarioMuseus = Object.entries(overviewByMuseu)
      .map(([museu, data]) => ({
        museu,
        ...data,
      }))
      .sort((a, b) => a.museu.localeCompare(b.museu));

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
      compras_inconsistentes_museu: inconsistentMuseuPurchases.length,
      lancamentos_sem_rubrica: lancamentosSemRubrica.length,
      lancamentos_inconsistentes_museu: lancamentosInconsistentesMuseu.length,
      museus_detectados: allMuseus,
      sumario_por_museu: sumarioMuseus,
      split_evenly_by_museu: splitEvenlyByMuseu,
    };

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      sumario,
      inconsistencias: {
        compras_pagas_nao_vinculadas: unmatchedPaidPurchases,
        compras_inconsistentes_museu: inconsistentMuseuPurchases,
        lancamentos_sem_rubrica: lancamentosSemRubrica,
        lancamentos_inconsistentes_museu: lancamentosInconsistentesMuseu,
      },
      duplicadas: rubricasDuplicadas.map((r) => ({
        id: r.id,
        grupo: r.grupo || null,
        rubrica: r.rubrica || r.nome || null,
        centro_custo: getRubricaCentroCusto(r) || null,
        valor_rubrica: toNumber(r.valor_rubrica),
        rubrica_key: r.rubrica_key || buildRubricaKey(r),
      })),
      results,
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});  if (raw.includes('historico abilio barreto')) return 'MHAB';
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

function buildRubricaMuseuKey(rubricaId: string, museu: string): string {
  return `${rubricaId}__${normalizeMuseu(museu) || 'SEM_MUSEU'}`;
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

function sameMuseuOrGlobal(entityMuseu: string, purchaseMuseu: string): boolean {
  if (!purchaseMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === purchaseMuseu;
}

function safeJsonParse(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
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
    MHAB: toNumber(
      rubrica?.valor_mhab ?? rubrica?.orcado_mhab ?? rubrica?.planejado_mhab
    ),
    MUMO: toNumber(
      rubrica?.valor_mumo ?? rubrica?.orcado_mumo ?? rubrica?.planejado_mumo
    ),
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

async function listAll(entityApi: any, orderBy: string, pageSize = 500) {
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

function resolveRubricaFromPurchase(
  purchase: any,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);

    if (rubrica) {
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

      return {
        rubricaId: rubrica.id,
        rubricaMuseu,
        purchaseMuseu,
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
    const budgetMuseu = getBudgetLineCentroCusto(bl);

    if (bl && !sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'budgetline_incompativel_museu',
        motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
      };
    }

    if (bl?.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === bl.rubrica_id);

      if (rubrica) {
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
        const rubricaMuseu = getRubricaCentroCusto(r);

        return (
          nomeRubrica === nomeBL &&
          sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)
        );
      });

      if (matches.length === 1) {
        return {
          rubricaId: matches[0].id,
          rubricaMuseu: getRubricaCentroCusto(matches[0]),
          purchaseMuseu,
          origem: 'budgetline_nome',
          motivo: null,
        };
      }

      if (matches.length > 1) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'nao_encontrada',
          motivo: 'Match ambíguo via budget line considerando museu',
        };
      }
    }
  }

  return {
    rubricaId: null,
    rubricaMuseu: null,
    purchaseMuseu,
    origem: 'nao_encontrada',
    motivo: purchaseMuseu
      ? 'Rubrica não resolvida para o museu informado'
      : 'Rubrica não resolvida',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const splitEvenlyByMuseu = Boolean(body?.split_evenly_by_museu);

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

    const rubricasMap = new Map<string, any>();
    const rubricasDuplicadas: any[] = [];

    for (const r of rubricasRaw) {
      const key = r?.rubrica_key || buildRubricaKey(r);

      if (!rubricasMap.has(key)) {
        rubricasMap.set(key, r);
      } else {
        rubricasDuplicadas.push(r);
      }
    }

    const rubricas = Array.from(rubricasMap.values());

    const budgetLineById: Record<string, any> = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const museusDetectados = new Set<string>(DEFAULT_MUSEUS);

    for (const purchase of allPurchases) {
      const museu = getPurchaseCentroCusto(purchase);
      if (museu) museusDetectados.add(museu);
    }

    for (const rubrica of rubricas) {
      const museu = getRubricaCentroCusto(rubrica);
      if (museu) museusDetectados.add(museu);
    }

    for (const bl of allBudgetLines) {
      const museu = getBudgetLineCentroCusto(bl);
      if (museu) museusDetectados.add(museu);
    }

    const allMuseus = Array.from(museusDetectados).filter(Boolean);

    const lancamentosPorRubrica: Record<string, any[]> = {};
    const lancamentosPorRubricaMuseu: Record<string, any[]> = {};

    for (const l of allLancamentos) {
      if (!l?.rubrica_id) continue;

      const lancamentoMuseu = normalizeMuseu(
        l?.centro_custo || l?.museu || l?.museu_codigo || ''
      );

      if (!lancamentosPorRubrica[l.rubrica_id]) {
        lancamentosPorRubrica[l.rubrica_id] = [];
      }
      lancamentosPorRubrica[l.rubrica_id].push(l);

      if (lancamentoMuseu) {
        const compositeKey = buildRubricaMuseuKey(l.rubrica_id, lancamentoMuseu);
        if (!lancamentosPorRubricaMuseu[compositeKey]) {
          lancamentosPorRubricaMuseu[compositeKey] = [];
        }
        lancamentosPorRubricaMuseu[compositeKey].push(l);
      }
    }

    const comprasPagasPorRubrica: Record<string, any[]> = {};
    const comprasAprovadasPorRubrica: Record<string, any[]> = {};
    const comprasPagasPorRubricaMuseu: Record<string, any[]> = {};
    const comprasAprovadasPorRubricaMuseu: Record<string, any[]> = {};

    const unmatchedPaidPurchases: any[] = [];
    const inconsistentMuseuPurchases: any[] = [];

    for (const purchase of allPurchases) {
      const status = normalizeStatus(purchase.status);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricas,
        budgetLineById
      );

      if (!resolved.rubricaId) {
        const issue = {
          purchase_id: purchase.id,
          titulo: purchase.titulo || purchase.objeto || purchase.descricao_item || '',
          fornecedor:
            purchase.fornecedor ||
            purchase.fornecedor_nome ||
            '',
          valor_pago: toNumber(purchase.valor_pago),
          valor_referencia: getPurchaseValue(purchase),
          status: purchase.status,
          centro_custo: resolved.purchaseMuseu || null,
          rubrica_id: purchase.rubrica_id || null,
          budgetline_id:
            purchase.budgetline_id ||
            purchase.budget_line_id ||
            purchase.linha_orcamentaria_id ||
            null,
          motivo: resolved.motivo,
          origem: resolved.origem,
        };

        if (status === 'PAGO') {
          unmatchedPaidPurchases.push(issue);
        } else {
          inconsistentMuseuPurchases.push(issue);
        }
        continue;
      }

      const purchaseMuseu = resolved.purchaseMuseu || '';
      const rubricaId = resolved.rubricaId;
      const compositeKey = purchaseMuseu
        ? buildRubricaMuseuKey(rubricaId, purchaseMuseu)
        : '';

      if (status === 'PAGO') {
        if (!comprasPagasPorRubrica[rubricaId]) {
          comprasPagasPorRubrica[rubricaId] = [];
        }
        comprasPagasPorRubrica[rubricaId].push(purchase);

        if (compositeKey) {
          if (!comprasPagasPorRubricaMuseu[compositeKey]) {
            comprasPagasPorRubricaMuseu[compositeKey] = [];
          }
          comprasPagasPorRubricaMuseu[compositeKey].push(purchase);
        }
      }

      if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
        if (!comprasAprovadasPorRubrica[rubricaId]) {
          comprasAprovadasPorRubrica[rubricaId] = [];
        }
        comprasAprovadasPorRubrica[rubricaId].push(purchase);

        if (compositeKey) {
          if (!comprasAprovadasPorRubricaMuseu[compositeKey]) {
            comprasAprovadasPorRubricaMuseu[compositeKey] = [];
          }
          comprasAprovadasPorRubricaMuseu[compositeKey].push(purchase);
        }
      }
    }

    const results: any[] = [];
    const overviewByMuseu: Record<
      string,
      {
        valor_orcado: number;
        valor_pago: number;
        valor_comprometido: number;
        valor_lancamentos: number;
        valor_utilizado: number;
        saldo: number;
        total_rubricas: number;
      }
    > = {};

    for (const museu of allMuseus) {
      overviewByMuseu[museu] = {
        valor_orcado: 0,
        valor_pago: 0,
        valor_comprometido: 0,
        valor_lancamentos: 0,
        valor_utilizado: 0,
        saldo: 0,
        total_rubricas: 0,
      };
    }

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const rubricaKey = rubrica.rubrica_key || buildRubricaKey(rubrica);

      const lans = lancamentosPorRubrica[rubricaId] || [];
      const valorLancamentos = Number(
        lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
      );

      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];

      const valorPago = Number(
        comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorComprometido = Number(
        comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );

      const valorUtilizado = Number(
        (valorPago + valorComprometido + valorLancamentos).toFixed(2)
      );

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const saldo = Number((valorRubrica - valorUtilizado).toFixed(2));
      const percentualUtilizado =
        valorRubrica > 0
          ? Number(((valorUtilizado / valorRubrica) * 100).toFixed(2))
          : 0;

      const distribution = getRubricaPlannedDistribution(rubrica, {
        splitEvenlyByMuseu,
        museusConsiderados: allMuseus,
      });

      const detalhamentoPorMuseu = allMuseus.map((museu) => {
        const compositeKey = buildRubricaMuseuKey(rubricaId, museu);

        const lansMuseu = lancamentosPorRubricaMuseu[compositeKey] || [];
        const comprasPagasMuseu = comprasPagasPorRubricaMuseu[compositeKey] || [];
        const comprasAprovadasMuseu =
          comprasAprovadasPorRubricaMuseu[compositeKey] || [];

        const valorLancamentosMuseu = Number(
          lansMuseu.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2)
        );

        const valorPagoMuseu = Number(
          comprasPagasMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
        );

        const valorComprometidoMuseu = Number(
          comprasAprovadasMuseu
            .reduce((s, p) => s + getPurchaseValue(p), 0)
            .toFixed(2)
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

        if (valorPlanejadoMuseu > 0 || valorUtilizadoMuseu > 0) {
          if (!overviewByMuseu[museu]) {
            overviewByMuseu[museu] = {
              valor_orcado: 0,
              valor_pago: 0,
              valor_comprometido: 0,
              valor_lancamentos: 0,
              valor_utilizado: 0,
              saldo: 0,
              total_rubricas: 0,
            };
          }

          overviewByMuseu[museu].valor_orcado = Number(
            (overviewByMuseu[museu].valor_orcado + valorPlanejadoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_pago = Number(
            (overviewByMuseu[museu].valor_pago + valorPagoMuseu).toFixed(2)
          );
          overviewByMuseu[museu].valor_comprometido = Number(
            (
              overviewByMuseu[museu].valor_comprometido + valorComprometidoMuseu
            ).toFixed(2)
          );
          overviewByMuseu[museu].valor_lancamentos = Number(
            (
              overviewByMuseu[museu].valor_lancamentos + valorLancamentosMuseu
            ).toFixed(2)
          );
          overviewByMuseu[museu].valor_utilizado = Number(
            (
              overviewByMuseu[museu].valor_utilizado + valorUtilizadoMuseu
            ).toFixed(2)
          );
          overviewByMuseu[museu].saldo = Number(
            (
              overviewByMuseu[museu].saldo +
              (saldoMuseu === null ? 0 : saldoMuseu)
            ).toFixed(2)
          );
          overviewByMuseu[museu].total_rubricas += 1;
        }

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
          distribuicao_mode: distribution.mode,
        };
      });

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        rubrica_key: rubricaKey,
        centro_custo: getRubricaCentroCusto(rubrica) || null,
        num_compras_pagas: comprasPagas.length,
        num_compras_aprovadas: comprasAprovadas.length,
        valor_pago: valorPago,
        valor_comprometido: valorComprometido,
        valor_lancamentos: valorLancamentos,
        valor_utilizado: valorUtilizado,
        valor_rubrica: valorRubrica,
        saldo,
        percentual_utilizado: percentualUtilizado,
        distribuicao_mode: distribution.mode,
        detalhamento_por_museu: detalhamentoPorMuseu,
        fonte: 'compras+lancamentos+museu',
        _update: {
          valor_utilizado: valorUtilizado,
          saldo,
          percentual_utilizado: percentualUtilizado,
          rubrica_key: rubricaKey,
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
      } catch (e: any) {
        console.error('Erro ao atualizar lote:', e?.message || e);
      }
    }

    const valor_total_orcado = Number(
      results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2)
    );

    const valor_total_utilizado = Number(
      results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2)
    );

    const valor_total_saldo = Number(
      results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2)
    );

    const TETO_CORRETO = 1320000;
    const diferenca_total = Number((valor_total_orcado - TETO_CORRETO).toFixed(2));

    const sumarioMuseus = Object.entries(overviewByMuseu)
      .map(([museu, data]) => ({
        museu,
        ...data,
      }))
      .sort((a, b) => a.museu.localeCompare(b.museu));

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
      compras_inconsistentes_museu: inconsistentMuseuPurchases.length,
      museus_detectados: allMuseus,
      sumario_por_museu: sumarioMuseus,
      split_evenly_by_museu: splitEvenlyByMuseu,
    };

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      sumario,
      inconsistencias: {
        compras_pagas_nao_vinculadas: unmatchedPaidPurchases,
        compras_inconsistentes_museu: inconsistentMuseuPurchases,
      },
      duplicadas: rubricasDuplicadas.map((r) => ({
        id: r.id,
        grupo: r.grupo || null,
        rubrica: r.rubrica || r.nome || null,
        centro_custo: getRubricaCentroCusto(r) || null,
        valor_rubrica: toNumber(r.valor_rubrica),
        rubrica_key: r.rubrica_key || buildRubricaKey(r),
      })),
      results,
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});
