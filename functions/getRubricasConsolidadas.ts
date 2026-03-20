import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['som/luz', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
  ['educador', 'educador'],
  ['noturno', 'noturno'],
  ['publicac', 'publicacoes'],
  ['publicaç', 'publicacoes'],
  ['consult', 'consultorias'],
  ['formac', 'consultorias'],
  ['diária', 'diarias_educador'],
  ['despesa geral', 'despesas_gerais'],
  ['despesas gerais', 'despesas_gerais'],
  ['equipe', 'equipe'],
  ['coordenador', 'equipe'],
  ['produc', 'equipe'],
  ['designer', 'comunicacao'],
  ['comunic', 'comunicacao'],
  ['imprensa', 'comunicacao'],
  ['fotograf', 'comunicacao'],
];

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
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

function getPurchaseCentroCusto(purchase: any): string {
  return normalizeMuseu(
    purchase?.centro_custo ||
      purchase?.museu ||
      purchase?.museu_codigo ||
      purchase?.unidade ||
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

function sameMuseuOrGlobal(entityMuseu: string, itemMuseu: string): boolean {
  if (!itemMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === itemMuseu;
}

function safeJsonParse(value: unknown): any {
  if (!value) return null;

  if (typeof value === 'object') return value;

  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
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

function inferirCategoria(rubrica: any, budgetLine: any = null): string {
  const texto = normalizeString(
    (rubrica?.grupo || '') +
      ' ' +
      (rubrica?.rubrica || rubrica?.nome || '') +
      ' ' +
      (rubrica?.observacao_uso || '') +
      ' ' +
      (budgetLine?.descricao || budgetLine?.rubrica || budgetLine?.nome || '')
  );

  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }

  return 'outros';
}

function buildFallbackDistribution(rubrica: any) {
  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  const valorRubrica = toNumber(rubrica?.valor_rubrica);

  if (rubricaMuseu) {
    return {
      mode: 'single_museu',
      byMuseu: {
        [rubricaMuseu]: {
          valor_planejado: valorRubrica,
          valor_pago: toNumber(rubrica?.valor_pago),
          valor_comprometido: toNumber(rubrica?.valor_comprometido),
          valor_lancamentos: toNumber(rubrica?.valor_lancamentos),
          valor_utilizado: toNumber(rubrica?.valor_utilizado),
          saldo: toNumber(rubrica?.saldo),
          percentual_utilizado: toNumber(rubrica?.percentual_utilizado),
          num_compras_pagas: toNumber(rubrica?.num_compras_pagas),
          num_compras_aprovadas: toNumber(rubrica?.num_compras_aprovadas),
          num_lancamentos: toNumber(rubrica?.num_lancamentos),
        },
      },
    };
  }

  return {
    mode: 'global_only',
    byMuseu: {},
  };
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

function resolveRubricaFromPurchase(
  purchase: any,
  rubricaById: Record<string, any>,
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricaById[purchase.rubrica_id];

    if (!rubrica) {
      return {
        rubricaId: null,
        purchaseMuseu,
        origem: 'rubrica_id_nao_encontrada',
      };
    }

    const rubricaMuseu = getRubricaCentroCusto(rubrica);

    if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        purchaseMuseu,
        origem: 'rubrica_id_incompativel_museu',
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
          purchaseMuseu,
          origem: 'budgetline_nao_encontrada',
        };
      }

      const budgetMuseu = getBudgetLineCentroCusto(bl);
      if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
        return {
          rubricaId: null,
          purchaseMuseu,
          origem: 'budgetline_incompativel_museu',
        };
      }

      if (bl?.rubrica_id && bl.rubrica_id !== rubrica.id) {
        return {
          rubricaId: null,
          purchaseMuseu,
          origem: 'budgetline_rubrica_divergente',
        };
      }
    }

    return {
      rubricaId: rubrica.id,
      purchaseMuseu,
      origem: 'rubrica_id',
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
      purchaseMuseu,
      origem: 'sem_rubrica_id_e_sem_budgetline',
    };
  }

  const bl = budgetLineById[blId];
  if (!bl) {
    return {
      rubricaId: null,
      purchaseMuseu,
      origem: 'budgetline_nao_encontrada',
    };
  }

  const budgetMuseu = getBudgetLineCentroCusto(bl);
  if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      purchaseMuseu,
      origem: 'budgetline_incompativel_museu',
    };
  }

  if (!bl?.rubrica_id) {
    return {
      rubricaId: null,
      purchaseMuseu,
      origem: 'budgetline_sem_rubrica_id',
    };
  }

  const rubrica = rubricaById[bl.rubrica_id];
  if (!rubrica) {
    return {
      rubricaId: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_nao_encontrada',
    };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_incompativel_museu',
    };
  }

  return {
    rubricaId: rubrica.id,
    purchaseMuseu,
    origem: 'budgetline_rubrica_id',
  };
}

function getDetalhamentoRubricaPorMuseu(rubrica: any) {
  const parsed =
    safeJsonParse(rubrica?.detalhamento_por_museu_json) ||
    safeJsonParse(rubrica?.detalhamento_por_museu);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => ({
        museu: normalizeMuseu(item?.museu),
        valor_planejado: toNumber(item?.valor_planejado),
        valor_pago: toNumber(item?.valor_pago),
        valor_comprometido: toNumber(item?.valor_comprometido),
        valor_lancamentos: toNumber(item?.valor_lancamentos),
        valor_utilizado: toNumber(item?.valor_utilizado),
        saldo: item?.saldo === null || item?.saldo === undefined ? null : toNumber(item?.saldo),
        percentual_utilizado:
          item?.percentual_utilizado === null || item?.percentual_utilizado === undefined
            ? null
            : toNumber(item?.percentual_utilizado),
        num_compras_pagas: toNumber(item?.num_compras_pagas),
        num_compras_aprovadas: toNumber(item?.num_compras_aprovadas),
        num_lancamentos: toNumber(item?.num_lancamentos),
        distribuicao_mode: item?.distribuicao_mode || null,
      }))
      .filter((item) => item.museu);
  }

  return [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado', success: false }, { status: 401 });
    }

    const [rubricas, configs, budgetLines, purchases] = await Promise.all([
      listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
      listAll(base44.asServiceRole.entities.RubricaMuseuConfig, '', 500),
      listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
      listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
    ]);

    const rubricasAtivas = rubricas.filter((r) => r?.ativo !== false);

    const budgetLineById: Record<string, any> = {};
    for (const bl of budgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const rubricaById: Record<string, any> = {};
    for (const rubrica of rubricasAtivas) {
      if (rubrica?.id) rubricaById[rubrica.id] = rubrica;
    }

    const configsByRubrica: Record<string, any[]> = {};
    for (const c of configs) {
      if (!c?.rubrica_id) continue;
      if (!configsByRubrica[c.rubrica_id]) configsByRubrica[c.rubrica_id] = [];
      configsByRubrica[c.rubrica_id].push(c);
    }

    const comprasPagasPorRubrica: Record<string, any[]> = {};
    const comprasAprovadasPorRubrica: Record<string, any[]> = {};

    for (const purchase of purchases) {
      const status = normalizeStatus(purchase?.status);
      const resolved = resolveRubricaFromPurchase(
        purchase,
        rubricaById,
        budgetLineById
      );

      if (!resolved.rubricaId) continue;

      if (status === 'PAGO') {
        if (!comprasPagasPorRubrica[resolved.rubricaId]) {
          comprasPagasPorRubrica[resolved.rubricaId] = [];
        }
        comprasPagasPorRubrica[resolved.rubricaId].push(purchase);
      }

      if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
        if (!comprasAprovadasPorRubrica[resolved.rubricaId]) {
          comprasAprovadasPorRubrica[resolved.rubricaId] = [];
        }
        comprasAprovadasPorRubrica[resolved.rubricaId].push(purchase);
      }
    }

    const resultado: Record<string, Record<string, any[]>> = {};
    for (const museu of MUSEUS) resultado[museu] = {};

    const totaisPorMuseu: Record<
      string,
      {
        totalOrcado: number;
        totalUtilizado: number;
        totalPago: number;
        totalComprometido: number;
        totalLancamentos: number;
        totalSaldo: number;
        pct: number;
      }
    > = {};

    for (const museu of MUSEUS) {
      totaisPorMuseu[museu] = {
        totalOrcado: 0,
        totalUtilizado: 0,
        totalPago: 0,
        totalComprometido: 0,
        totalLancamentos: 0,
        totalSaldo: 0,
        pct: 0,
      };
    }

    for (const rubrica of rubricasAtivas) {
      const rubricaId = rubrica.id;
      const budgetlineId =
        rubrica?.budgetline_id ||
        rubrica?.budget_line_id ||
        rubrica?.linha_orcamentaria_id ||
        null;
      const budgetLine = budgetlineId ? budgetLineById[budgetlineId] || null : null;

      const detalhamentoExistente = getDetalhamentoRubricaPorMuseu(rubrica);

      let associacoes: Array<{
        museu: string;
        categoria_key: string;
        divisor: number;
        valor_planejado?: number;
        valor_pago?: number;
        valor_comprometido?: number;
        valor_lancamentos?: number;
        valor_utilizado?: number;
        saldo?: number | null;
        percentual_utilizado?: number | null;
        num_compras_pagas?: number;
        num_compras_aprovadas?: number;
        num_lancamentos?: number;
        distribuicao_mode?: string | null;
      }> = [];

      if (detalhamentoExistente.length > 0) {
        associacoes = detalhamentoExistente.map((item) => ({
          museu: item.museu,
          categoria_key: inferirCategoria(rubrica, budgetLine),
          divisor: 1,
          valor_planejado: item.valor_planejado,
          valor_pago: item.valor_pago,
          valor_comprometido: item.valor_comprometido,
          valor_lancamentos: item.valor_lancamentos,
          valor_utilizado: item.valor_utilizado,
          saldo: item.saldo,
          percentual_utilizado: item.percentual_utilizado,
          num_compras_pagas: item.num_compras_pagas,
          num_compras_aprovadas: item.num_compras_aprovadas,
          num_lancamentos: item.num_lancamentos,
          distribuicao_mode: item.distribuicao_mode || null,
        }));
      } else {
        const configsRubrica = configsByRubrica[rubricaId] || [];

        if (configsRubrica.length > 0) {
          associacoes = configsRubrica
            .map((c) => ({
              museu: normalizeMuseu(c?.museu),
              categoria_key: c?.categoria_key || inferirCategoria(rubrica, budgetLine),
              divisor: toNumber(c?.divisor) || 1,
            }))
            .filter((item) => item.museu);
        } else {
          const fallback = buildFallbackDistribution(rubrica);
          const fallbackEntries = Object.entries(fallback.byMuseu);

          if (fallbackEntries.length > 0) {
            associacoes = fallbackEntries.map(([museu, dados]) => ({
              museu,
              categoria_key: inferirCategoria(rubrica, budgetLine),
              divisor: 1,
              valor_planejado: toNumber((dados as any)?.valor_planejado),
              valor_pago: toNumber((dados as any)?.valor_pago),
              valor_comprometido: toNumber((dados as any)?.valor_comprometido),
              valor_lancamentos: toNumber((dados as any)?.valor_lancamentos),
              valor_utilizado: toNumber((dados as any)?.valor_utilizado),
              saldo:
                (dados as any)?.saldo === null || (dados as any)?.saldo === undefined
                  ? null
                  : toNumber((dados as any)?.saldo),
              percentual_utilizado:
                (dados as any)?.percentual_utilizado === null ||
                (dados as any)?.percentual_utilizado === undefined
                  ? null
                  : toNumber((dados as any)?.percentual_utilizado),
              num_compras_pagas: toNumber((dados as any)?.num_compras_pagas),
              num_compras_aprovadas: toNumber((dados as any)?.num_compras_aprovadas),
              num_lancamentos: toNumber((dados as any)?.num_lancamentos),
              distribuicao_mode: fallback.mode,
            }));
          }
        }
      }

      if (associacoes.length === 0) {
        const rubricaMuseu = getRubricaCentroCusto(rubrica);
        if (rubricaMuseu && MUSEUS.includes(rubricaMuseu)) {
          associacoes = [
            {
              museu: rubricaMuseu,
              categoria_key: inferirCategoria(rubrica, budgetLine),
              divisor: 1,
            },
          ];
        }
      }

      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];

      const valorPagoRubrica = Number(
        comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );
      const valorComprometidoRubrica = Number(
        comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2)
      );
      const valorLancamentosRubrica = toNumber(rubrica?.valor_lancamentos);
      const valorUtilizadoRubrica = toNumber(rubrica?.valor_utilizado);
      const valorRubrica = toNumber(rubrica?.valor_rubrica);
      const saldoRubrica = toNumber(rubrica?.saldo);
      const pctRubrica = toNumber(rubrica?.percentual_utilizado);

      for (const assoc of associacoes) {
        if (!assoc?.museu || !resultado[assoc.museu]) continue;

        const categoria = assoc.categoria_key || 'outros';
        if (!resultado[assoc.museu][categoria]) resultado[assoc.museu][categoria] = [];

        const divisor = toNumber(assoc.divisor) || 1;

        const totalOrcado =
          assoc.valor_planejado !== undefined
            ? toNumber(assoc.valor_planejado)
            : Number((valorRubrica / divisor).toFixed(2));

        const valorPago =
          assoc.valor_pago !== undefined
            ? toNumber(assoc.valor_pago)
            : Number((valorPagoRubrica / divisor).toFixed(2));

        const valorComprometido =
          assoc.valor_comprometido !== undefined
            ? toNumber(assoc.valor_comprometido)
            : Number((valorComprometidoRubrica / divisor).toFixed(2));

        const valorLancamentos =
          assoc.valor_lancamentos !== undefined
            ? toNumber(assoc.valor_lancamentos)
            : Number((valorLancamentosRubrica / divisor).toFixed(2));

        const valorUtilizado =
          assoc.valor_utilizado !== undefined
            ? toNumber(assoc.valor_utilizado)
            : Number((valorUtilizadoRubrica / divisor).toFixed(2));

        const saldo =
          assoc.saldo !== undefined
            ? assoc.saldo === null
              ? null
              : toNumber(assoc.saldo)
            : Number((saldoRubrica / divisor).toFixed(2));

        const pct =
          assoc.percentual_utilizado !== undefined
            ? assoc.percentual_utilizado === null
              ? (totalOrcado > 0
                  ? Number(((valorUtilizado / totalOrcado) * 100).toFixed(2))
                  : 0)
              : toNumber(assoc.percentual_utilizado)
            : totalOrcado > 0
              ? Number(((valorUtilizado / totalOrcado) * 100).toFixed(2))
              : toNumber(pctRubrica);

        const item = {
          id: rubricaId,
          rubrica: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          centro_custo: getRubricaCentroCusto(rubrica) || null,
          valor_rubrica: valorRubrica,
          totalOrcado,
          valorUtilizado,
          valorPago,
          valorComprometido,
          valorLancamentos,
          saldo,
          pct,
          divisor,
          distribuicao_mode: assoc.distribuicao_mode || null,
          num_lancamentos:
            assoc.num_lancamentos !== undefined
              ? toNumber(assoc.num_lancamentos)
              : toNumber(rubrica?.num_lancamentos),
          num_compras_pagas:
            assoc.num_compras_pagas !== undefined
              ? toNumber(assoc.num_compras_pagas)
              : comprasPagas.length,
          num_compras_aprovadas:
            assoc.num_compras_aprovadas !== undefined
              ? toNumber(assoc.num_compras_aprovadas)
              : comprasAprovadas.length,
          budgetline_id: budgetlineId,
        };

        resultado[assoc.museu][categoria].push(item);

        totaisPorMuseu[assoc.museu].totalOrcado = Number(
          (totaisPorMuseu[assoc.museu].totalOrcado + totalOrcado).toFixed(2)
        );
        totaisPorMuseu[assoc.museu].totalUtilizado = Number(
          (totaisPorMuseu[assoc.museu].totalUtilizado + valorUtilizado).toFixed(2)
        );
        totaisPorMuseu[assoc.museu].totalPago = Number(
          (totaisPorMuseu[assoc.museu].totalPago + valorPago).toFixed(2)
        );
        totaisPorMuseu[assoc.museu].totalComprometido = Number(
          (totaisPorMuseu[assoc.museu].totalComprometido + valorComprometido).toFixed(2)
        );
        totaisPorMuseu[assoc.museu].totalLancamentos = Number(
          (totaisPorMuseu[assoc.museu].totalLancamentos + valorLancamentos).toFixed(2)
        );

        const saldoSomavel = saldo === null ? 0 : toNumber(saldo);
        totaisPorMuseu[assoc.museu].totalSaldo = Number(
          (totaisPorMuseu[assoc.museu].totalSaldo + saldoSomavel).toFixed(2)
        );
      }
    }

    for (const museu of MUSEUS) {
      const totalOrcado = toNumber(totaisPorMuseu[museu].totalOrcado);
      const totalUtilizado = toNumber(totaisPorMuseu[museu].totalUtilizado);

      totaisPorMuseu[museu].pct =
        totalOrcado > 0
          ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2))
          : 0;
    }

    const sumarioPorMuseu = MUSEUS.map((museu) => ({
      museu,
      valor_orcado: toNumber(totaisPorMuseu[museu]?.totalOrcado),
      valor_pago: toNumber(totaisPorMuseu[museu]?.totalPago),
      valor_comprometido: toNumber(totaisPorMuseu[museu]?.totalComprometido),
      valor_lancamentos: toNumber(totaisPorMuseu[museu]?.totalLancamentos),
      valor_utilizado: toNumber(totaisPorMuseu[museu]?.totalUtilizado),
      saldo: toNumber(totaisPorMuseu[museu]?.totalSaldo),
      total_rubricas: Object.values(resultado[museu] || {}).reduce(
        (acc: number, items: any) => acc + (Array.isArray(items) ? items.length : 0),
        0
      ),
    }));

    return Response.json({
      success: true,
      por_museu: resultado,
      totais_por_museu: totaisPorMuseu,
      sumario_por_museu: sumarioPorMuseu,
      total_rubricas: rubricasAtivas.length,
      total_configs: configs.length,
      total_budgetlines: budgetLines.length,
      total_purchases: purchases.length,
    });
  } catch (error: any) {
    console.error('getRubricasConsolidadas error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});
