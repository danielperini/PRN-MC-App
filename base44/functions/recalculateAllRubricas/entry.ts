import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DEFAULT_MUSEUS = ['MIS', 'MHAB', 'MUMO'];
const TEAM_PAYMENT_START_YEAR = 2026;
const TEAM_PAYMENT_START_MONTH_INDEX = 3; // Abril = 3

function toNumber(value: any) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value: any) {
  return String(value || '').trim().toUpperCase();
}

function normalizeString(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: any) {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw.includes('museu da imagem e do som') || raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('historico abilio barreto') || raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';
  return String(value || '').trim().toUpperCase();
}

function buildRubricaKey(rubrica: any) {
  const grupo = normalizeString(rubrica?.grupo || '');
  const nome = normalizeString(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '');
  const museu = normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || '');
  return `${grupo}__${nome}__${museu || 'GLOBAL'}`;
}

function buildRubricaMuseuKey(rubricaId: string, museu: string) {
  return `${rubricaId}__${normalizeMuseu(museu) || 'SEM_MUSEU'}`;
}

function getPurchaseValue(purchase: any) {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseCentroCusto(purchase: any) {
  return normalizeMuseu(purchase?.centro_custo || purchase?.museu || purchase?.museu_codigo || purchase?.unidade || '');
}

function getRubricaCentroCusto(rubrica: any) {
  return normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || rubrica?.unidade || '');
}

function getBudgetLineCentroCusto(bl: any) {
  return normalizeMuseu(bl?.centro_custo || bl?.museu || bl?.museu_codigo || bl?.unidade || '');
}

function getLancamentoCentroCusto(l: any) {
  return normalizeMuseu(l?.centro_custo || l?.museu || l?.museu_codigo || l?.unidade || '');
}

function sameMuseuOrGlobal(entityMuseu: string, itemMuseu: string) {
  if (!itemMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === itemMuseu;
}

function safeJsonParse(value: any) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractPlanValueFromObject(obj: any, museu: string) {
  if (!obj) return 0;
  const nm = normalizeMuseu(museu);
  for (const key of [nm, nm.toLowerCase(), nm.toUpperCase()]) {
    if (key in obj) return toNumber(obj[key]);
  }
  return 0;
}

function isEquipeEGestao(rubrica: any) {
  const grupo = normalizeString(rubrica?.grupo || '');
  return grupo.includes('equipe') || grupo.includes('gestao') || grupo.includes('gestão');
}

function getRubricaPlannedDistribution(rubrica: any, options: any) {
  const museusBase = Array.from(
    new Set((options?.museusConsiderados || DEFAULT_MUSEUS).map((m: string) => normalizeMuseu(m)).filter(Boolean))
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
  let hasExplicit = false;

  for (const museu of museusBase) {
    const v = explicitMap[museu] || extractPlanValueFromObject(jsonDistribuicao, museu);
    if (v > 0) {
      distribuicao[museu] = v;
      hasExplicit = true;
    }
  }

  if (hasExplicit) {
    return { mode: 'explicit', total: totalRubrica, byMuseu: distribuicao };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);
  if (rubricaMuseu) {
    return { mode: 'single_museu', total: totalRubrica, byMuseu: { [rubricaMuseu]: totalRubrica } };
  }

  if (options?.splitEvenlyByMuseu && museusBase.length > 0) {
    const valorBase = Number((totalRubrica / museusBase.length).toFixed(2));
    const dist: Record<string, number> = {};
    let acc = 0;

    museusBase.forEach((museu, i) => {
      if (i === museusBase.length - 1) {
        dist[museu] = Number((totalRubrica - acc).toFixed(2));
      } else {
        dist[museu] = valorBase;
        acc += valorBase;
      }
    });

    return { mode: 'equal_split', total: totalRubrica, byMuseu: dist };
  }

  return { mode: 'global_only', total: totalRubrica, byMuseu: {} };
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

function resolveRubricaFromPurchase(purchase: any, rubricas: any[], budgetLineById: Record<string, any>) {
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
          motivo: `Rubrica no museu ${rubricaMuseu}, compra em ${purchaseMuseu}`
        };
      }
      return { rubricaId: rubrica.id, rubricaMuseu, purchaseMuseu, origem: 'rubrica_id', motivo: null };
    }
  }

  const blId = purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id;
  if (blId) {
    const bl = budgetLineById[blId];
    if (!bl) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'budgetline_nao_encontrada',
        motivo: 'BudgetLine não encontrada'
      };
    }

    const budgetMuseu = getBudgetLineCentroCusto(bl);
    if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'budgetline_incompativel_museu',
        motivo: `BudgetLine no museu ${budgetMuseu}, compra em ${purchaseMuseu}`
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
            motivo: `Rubrica da BudgetLine no museu ${rubricaMuseu}`
          };
        }
        return { rubricaId: rubrica.id, rubricaMuseu, purchaseMuseu, origem: 'budgetline_id', motivo: null };
      }
    }
  }

  return {
    rubricaId: null,
    rubricaMuseu: null,
    purchaseMuseu,
    origem: 'nao_encontrada',
    motivo: 'Rubrica não resolvida'
  };
}

function monthNameToIndex(monthName: any) {
  const raw = normalizeString(monthName);
  const months = [
    'janeiro',
    'fevereiro',
    'marco',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
  ];
  return months.indexOf(raw);
}

function isFromApril2026Onward(tp: any) {
  const year = Number(tp?.ano || 0);
  const monthIndex = monthNameToIndex(tp?.mes_referencia);

  if (!Number.isFinite(year) || year <= 0 || monthIndex < 0) return false;
  if (year > TEAM_PAYMENT_START_YEAR) return true;
  if (year < TEAM_PAYMENT_START_YEAR) return false;
  return monthIndex >= TEAM_PAYMENT_START_MONTH_INDEX;
}

function getTeamPaymentKey(tp: any) {
  const teamMemberId = String(tp?.team_member_id || '').trim();
  const userEmail = String(tp?.user_email || '').trim().toLowerCase();
  const identidade = teamMemberId || userEmail;
  const mes = String(tp?.mes_referencia || '').trim().toLowerCase();
  const ano = String(tp?.ano || '').trim();
  return `${identidade}__${mes}__${ano}`;
}

function getTeamPaymentSortValue(tp: any) {
  return new Date(
    tp?.updated_date ||
    tp?.updated_at ||
    tp?.created_date ||
    tp?.created_at ||
    0
  ).getTime();
}

// DEDUP por pessoa + competência, preservando o registro mais recente
function buildTeamPaymentDeduped(allTeamPayments: any[]) {
  const ALLOWED_STATUSES = new Set([
    'APROVADO',
    'PAGO',
    'APROVADO_COORD',
    'ENCAMINHADO_COORD_ADMIN',
    'APROVADO_ADMIN',
    'FINALIZADO',
  ]);

  const filtered = (allTeamPayments || [])
    .filter((tp) => {
      const status = normalizeStatus(tp.status);
      if (!ALLOWED_STATUSES.has(status)) return false;
      if (!isFromApril2026Onward(tp)) return false;
      return true;
    })
    .sort((a, b) => getTeamPaymentSortValue(b) - getTeamPaymentSortValue(a));

  const seen = new Set<string>();
  const deduped: any[] = [];

  for (const tp of filtered) {
    const key = getTeamPaymentKey(tp);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tp);
  }

  return deduped;
}

function buildTeamPaymentByRubrica(dedupedPayments: any[], teamMemberById: Record<string, any>) {
  const byRubrica: Record<string, any[]> = {};

  for (const tp of dedupedPayments) {
    const member = teamMemberById[tp.team_member_id];
    const rubricaId = tp.rubrica_id || member?.rubrica_id || null;
    if (!rubricaId) continue;

    if (!byRubrica[rubricaId]) byRubrica[rubricaId] = [];

    const valor =
      toNumber(tp.valor_pago) ||
      toNumber(tp.valor_nf) ||
      toNumber(tp.valor_parcela_previsto) ||
      toNumber(tp.nf_valor_extraido) ||
      0;

    byRubrica[rubricaId].push({
      team_payment_id: tp.id,
      valor,
      member_id: tp.team_member_id,
      user_email: tp.user_email || '',
      status: normalizeStatus(tp.status),
      mes_referencia: tp.mes_referencia,
      ano: tp.ano,
    });
  }

  return byRubrica;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const splitEvenlyByMuseu = Boolean(body?.split_evenly_by_museu);

    const [rubricasRaw, allLancamentos, allPurchases, allBudgetLines, allTeamPayments, allTeamMembers] =
      await Promise.all([
        listAll(base44.asServiceRole.entities.Rubrica, 'ordem_exibicao', 500),
        listAll(base44.asServiceRole.entities.LancamentoRubrica, '-created_date', 500),
        listAll(base44.asServiceRole.entities.PurchaseRequest, '-created_date', 500),
        listAll(base44.asServiceRole.entities.BudgetLine, 'descricao', 500),
        listAll(base44.asServiceRole.entities.TeamPayment, '-created_date', 500),
        listAll(base44.asServiceRole.entities.TeamMember, 'nome', 500),
      ]);

    const rubricasMap = new Map();
    const rubricasDuplicadas: any[] = [];

    for (const r of rubricasRaw) {
      const key = r?.rubrica_key || buildRubricaKey(r);
      if (!rubricasMap.has(key)) rubricasMap.set(key, r);
      else rubricasDuplicadas.push(r);
    }

    const rubricas = Array.from(rubricasMap.values());

    const rubricaById: Record<string, any> = {};
    for (const r of rubricas) {
      if (r?.id) rubricaById[r.id] = r;
    }

    const budgetLineById: Record<string, any> = {};
    for (const bl of allBudgetLines) {
      if (bl?.id) budgetLineById[bl.id] = bl;
    }

    const teamMemberById: Record<string, any> = {};
    for (const tm of allTeamMembers) {
      if (tm?.id) teamMemberById[tm.id] = tm;
    }

    const dedupedTeamPayments = buildTeamPaymentDeduped(allTeamPayments);
    const teamPaymentsByRubrica = buildTeamPaymentByRubrica(dedupedTeamPayments, teamMemberById);

    const museusDetectados = new Set(DEFAULT_MUSEUS);
    for (const p of allPurchases) {
      const m = getPurchaseCentroCusto(p);
      if (m) museusDetectados.add(m);
    }
    for (const r of rubricas) {
      const m = getRubricaCentroCusto(r);
      if (m) museusDetectados.add(m);
    }
    for (const bl of allBudgetLines) {
      const m = getBudgetLineCentroCusto(bl);
      if (m) museusDetectados.add(m);
    }

    const allMuseus = Array.from(museusDetectados).filter(Boolean) as string[];

    const lancamentosPorRubrica: Record<string, any[]> = {};
    const lancamentosPorRubricaMuseu: Record<string, any[]> = {};
    const lancamentosSemRubrica: any[] = [];
    const lancamentosInconsistentesMuseu: any[] = [];

    for (const l of allLancamentos) {
      if (!l?.rubrica_id) {
        lancamentosSemRubrica.push(l);
        continue;
      }

      const rubrica = rubricaById[l.rubrica_id];
      if (!rubrica) {
        lancamentosSemRubrica.push(l);
        continue;
      }

      const lancMuseu = getLancamentoCentroCusto(l);
      const rubMuseu = getRubricaCentroCusto(rubrica);

      if (lancMuseu && rubMuseu && lancMuseu !== rubMuseu) {
        lancamentosInconsistentesMuseu.push(l);
        continue;
      }

      // Mantém TODOS os lançamentos manuais já inseridos
      if (!lancamentosPorRubrica[l.rubrica_id]) lancamentosPorRubrica[l.rubrica_id] = [];
      lancamentosPorRubrica[l.rubrica_id].push(l);

      if (lancMuseu) {
        const ck = buildRubricaMuseuKey(l.rubrica_id, lancMuseu);
        if (!lancamentosPorRubricaMuseu[ck]) lancamentosPorRubricaMuseu[ck] = [];
        lancamentosPorRubricaMuseu[ck].push(l);
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
      const resolved = resolveRubricaFromPurchase(purchase, rubricas, budgetLineById);

      if (!resolved.rubricaId) {
        const issue = {
          purchase_id: purchase.id,
          titulo: purchase.titulo || '',
          valor: getPurchaseValue(purchase),
          status: purchase.status,
          motivo: resolved.motivo,
          origem: resolved.origem
        };

        if (status === 'PAGO') unmatchedPaidPurchases.push(issue);
        else inconsistentMuseuPurchases.push(issue);
        continue;
      }

      const rubricaId = resolved.rubricaId;
      const purchaseMuseu = resolved.purchaseMuseu || '';
      const ck = purchaseMuseu ? buildRubricaMuseuKey(rubricaId, purchaseMuseu) : '';

      if (status === 'PAGO') {
        if (!comprasPagasPorRubrica[rubricaId]) comprasPagasPorRubrica[rubricaId] = [];
        comprasPagasPorRubrica[rubricaId].push(purchase);

        if (ck) {
          if (!comprasPagasPorRubricaMuseu[ck]) comprasPagasPorRubricaMuseu[ck] = [];
          comprasPagasPorRubricaMuseu[ck].push(purchase);
        }
      }

      if (status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD') {
        if (!comprasAprovadasPorRubrica[rubricaId]) comprasAprovadasPorRubrica[rubricaId] = [];
        comprasAprovadasPorRubrica[rubricaId].push(purchase);

        if (ck) {
          if (!comprasAprovadasPorRubricaMuseu[ck]) comprasAprovadasPorRubricaMuseu[ck] = [];
          comprasAprovadasPorRubricaMuseu[ck].push(purchase);
        }
      }
    }

    const results: any[] = [];
    const overviewByMuseu: Record<string, any> = {};

    for (const museu of allMuseus) {
      overviewByMuseu[museu] = {
        valor_orcado: 0,
        valor_pago: 0,
        valor_comprometido: 0,
        valor_lancamentos: 0,
        valor_utilizado: 0,
        saldo: 0,
        total_rubricas: 0
      };
    }

    for (const rubrica of rubricas) {
      const rubricaId = rubrica.id;
      const rubricaKey = rubrica.rubrica_key || buildRubricaKey(rubrica);

      const lans = lancamentosPorRubrica[rubricaId] || [];
      const comprasPagas = comprasPagasPorRubrica[rubricaId] || [];
      const comprasAprovadas = comprasAprovadasPorRubrica[rubricaId] || [];
      const teamPayments = teamPaymentsByRubrica[rubricaId] || [];

      const valorLancamentos = Number(lans.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));
      const valorPagoCompras = Number(comprasPagas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
      const valorComprometidoCompras = Number(comprasAprovadas.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));

      const valorPagoEquipe = Number(
        teamPayments
          .filter((tp) => tp.status === 'PAGO' || tp.status === 'FINALIZADO')
          .reduce((s, tp) => s + toNumber(tp.valor), 0)
          .toFixed(2)
      );

      const valorComprometidoEquipe = Number(
        teamPayments
          .filter((tp) => tp.status === 'APROVADO_COORD' || tp.status === 'APROVADO_ADMIN' || tp.status === 'APROVADO' || tp.status === 'ENCAMINHADO_COORD_ADMIN')
          .reduce((s, tp) => s + toNumber(tp.valor), 0)
          .toFixed(2)
      );

      const valorPago = Number((valorPagoCompras + valorPagoEquipe).toFixed(2));
      const valorComprometido = Number((valorComprometidoCompras + valorComprometidoEquipe).toFixed(2));

      // Mantém lançamentos manuais já inseridos + soma pagamentos reais
      const valorUtilizado = Number((valorPago + valorLancamentos).toFixed(2));

      const valorRubrica = toNumber(rubrica.valor_rubrica);
      const saldo = Number((valorRubrica - valorUtilizado - valorComprometido).toFixed(2));
      const percentualUtilizado = valorRubrica > 0
        ? Number((((valorUtilizado + valorComprometido) / valorRubrica) * 100).toFixed(2))
        : 0;

      const distribution = getRubricaPlannedDistribution(rubrica, {
        splitEvenlyByMuseu,
        museusConsiderados: allMuseus
      });

      const detalhamentoPorMuseu = allMuseus.map((museu) => {
        const ck = buildRubricaMuseuKey(rubricaId, museu);
        const lansMuseu = lancamentosPorRubricaMuseu[ck] || [];
        const cpMuseu = comprasPagasPorRubricaMuseu[ck] || [];
        const caMuseu = comprasAprovadasPorRubricaMuseu[ck] || [];

        const vlMuseu = Number(lansMuseu.reduce((s, l) => s + toNumber(l.valor), 0).toFixed(2));
        const vpMuseu = Number(cpMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
        const vcMuseu = Number(caMuseu.reduce((s, p) => s + getPurchaseValue(p), 0).toFixed(2));
        const vuMuseu = Number((vpMuseu + vlMuseu).toFixed(2));

        const vpPlanejado = Number(toNumber(distribution.byMuseu[museu] ?? 0).toFixed(2));
        const saldoMuseu = vpPlanejado > 0 ? Number((vpPlanejado - vuMuseu - vcMuseu).toFixed(2)) : null;
        const percMuseu = vpPlanejado > 0
          ? Number((((vuMuseu + vcMuseu) / vpPlanejado) * 100).toFixed(2))
          : null;

        if (vpPlanejado > 0 || vuMuseu > 0 || vcMuseu > 0) {
          if (!overviewByMuseu[museu]) {
            overviewByMuseu[museu] = {
              valor_orcado: 0,
              valor_pago: 0,
              valor_comprometido: 0,
              valor_lancamentos: 0,
              valor_utilizado: 0,
              saldo: 0,
              total_rubricas: 0
            };
          }

          overviewByMuseu[museu].valor_orcado = Number((overviewByMuseu[museu].valor_orcado + vpPlanejado).toFixed(2));
          overviewByMuseu[museu].valor_pago = Number((overviewByMuseu[museu].valor_pago + vpMuseu).toFixed(2));
          overviewByMuseu[museu].valor_comprometido = Number((overviewByMuseu[museu].valor_comprometido + vcMuseu).toFixed(2));
          overviewByMuseu[museu].valor_lancamentos = Number((overviewByMuseu[museu].valor_lancamentos + vlMuseu).toFixed(2));
          overviewByMuseu[museu].valor_utilizado = Number((overviewByMuseu[museu].valor_utilizado + vuMuseu).toFixed(2));
          overviewByMuseu[museu].saldo = Number((overviewByMuseu[museu].saldo + (saldoMuseu ?? 0)).toFixed(2));
          overviewByMuseu[museu].total_rubricas += 1;
        }

        return {
          museu,
          valor_planejado: vpPlanejado,
          valor_pago: vpMuseu,
          valor_comprometido: vcMuseu,
          valor_lancamentos: vlMuseu,
          valor_utilizado: vuMuseu,
          saldo: saldoMuseu,
          percentual_utilizado: percMuseu,
          distribuicao_mode: distribution.mode
        };
      });

      results.push({
        rubrica_id: rubricaId,
        rubrica: rubrica.rubrica || rubrica.nome || null,
        grupo: rubrica.grupo || null,
        rubrica_key: rubricaKey,
        centro_custo: getRubricaCentroCusto(rubrica) || null,
        eh_equipe_gestao: isEquipeEGestao(rubrica),
        num_team_payments_deduped: teamPayments.length,
        valor_pago_equipe: valorPagoEquipe,
        valor_comprometido_equipe: valorComprometidoEquipe,
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
        _update: {
          valor_utilizado: valorUtilizado,
          saldo_comprometido: valorComprometido,
          saldo,
          percentual_utilizado: percentualUtilizado,
          rubrica_key: rubricaKey
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

    const valor_total_orcado = Number(results.reduce((s, r) => s + toNumber(r.valor_rubrica), 0).toFixed(2));
    const valor_total_utilizado = Number(results.reduce((s, r) => s + toNumber(r.valor_utilizado), 0).toFixed(2));
    const valor_total_comprometido = Number(results.reduce((s, r) => s + toNumber(r.valor_comprometido), 0).toFixed(2));
    const valor_total_saldo = Number(results.reduce((s, r) => s + toNumber(r.saldo), 0).toFixed(2));

    const TETO_CORRETO = 1320000;
    const diferenca_total = Number((valor_total_orcado - TETO_CORRETO).toFixed(2));

    return Response.json({
      success: true,
      trigger: body?.trigger || null,
      sumario: {
        total_rubricas_raw: rubricasRaw.length,
        total_rubricas_unicas: results.length,
        total_duplicadas_detectadas: rubricasDuplicadas.length,
        total_atualizadas: updated,
        total_compras: allPurchases.length,
        total_lancamentos: allLancamentos.length,
        total_team_payments: allTeamPayments.length,
        total_team_payments_deduped: dedupedTeamPayments.length,
        valor_total_orcado,
        valor_total_utilizado,
        valor_total_comprometido,
        valor_total_saldo,
        teto_correto: TETO_CORRETO,
        diferenca_total,
        total_esta_correto: Math.abs(diferenca_total) < 0.01,
        compras_pagas_nao_vinculadas: unmatchedPaidPurchases.length,
        compras_inconsistentes_museu: inconsistentMuseuPurchases.length,
        lancamentos_sem_rubrica: lancamentosSemRubrica.length,
        lancamentos_inconsistentes_museu: lancamentosInconsistentesMuseu.length,
        museus_detectados: allMuseus,
        sumario_por_museu: Object.entries(overviewByMuseu)
          .map(([museu, d]) => ({ museu, ...d }))
          .sort((a: any, b: any) => a.museu.localeCompare(b.museu)),
        split_evenly_by_museu: splitEvenlyByMuseu,
        team_payment_start_year: TEAM_PAYMENT_START_YEAR,
        team_payment_start_month_index: TEAM_PAYMENT_START_MONTH_INDEX
      },
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
        rubrica_key: r.rubrica_key || buildRubricaKey(r)
      })),
      results,
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);
    return Response.json({ error: error?.message || String(error), success: false }, { status: 500 });
  }
});
